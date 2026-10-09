/**
 * Пополнение: от поступления на адрес до проводки.
 *
 * Номера в названиях — из списка обязательных тестов
 * (`docs/domain-and-money.md`).
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  claimDeposit,
  confirmDeposit,
  markRefunded,
  registerIncoming,
  DepositError,
  CLAIM_TTL_MS,
} from '@/server/services/deposits'
import { applySettlement, applyAuthorization } from '@/server/services/mirror'
import {
  addCard,
  balanceOf,
  fakeLimitPort,
  prisma,
  remainingOfCard,
  resetDb,
  seed,
} from './helpers'

beforeEach(resetDb)
afterAll(async () => {
  await prisma.$disconnect()
})

const PASSED = { amlVerdict: 'PASSED' as const, amlRisk: 5 }

describe('пополнение', () => {
  it('зачисляет на главную карту и поднимает её потолок', async () => {
    const { userId } = await seed()
    const cardId = await addCard({ userId, isPrimary: true })
    const port = fakeLimitPort()

    const { addressId } = await addressOf(userId)
    const result = await registerIncoming(prisma, port, {
      chainTxId: 'tx-1',
      addressId,
      receivedMinor: 60000n,
      ...PASSED,
    })

    expect(result.status).toBe('CREDITED')
    expect(await balanceOf(userId)).toBe(60000n)
    expect(await remainingOfCard(cardId)).toBe(60000n)
    expect(port.calls.at(-1)?.limit).toBe(60000n)
  })

  it('№2: внёс 600, потратил 100, внёс 500 → потолок 1100', async () => {
    const { userId } = await seed()
    const cardId = await addCard({ userId, isPrimary: true })
    const port = fakeLimitPort()
    const { addressId } = await addressOf(userId)

    await registerIncoming(prisma, port, {
      chainTxId: 'tx-1',
      addressId,
      receivedMinor: 60000n,
      ...PASSED,
    })

    // Потратил 100: авторизация, затем списание.
    await applyAuthorization(prisma, {
      id: 'ctx-1',
      cardId,
      amountMinor: 10000n,
      occurredAt: new Date(),
    })
    await applySettlement(prisma, { id: 'ctx-1', settledMinor: 10000n })

    await registerIncoming(prisma, port, {
      chainTxId: 'tx-2',
      addressId,
      receivedMinor: 50000n,
      ...PASSED,
    })

    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } })
    expect(card.appliedLimit).toBe(110000n) // не 1000 и не 1600
    expect(await remainingOfCard(cardId)).toBe(100000n)
    expect(await balanceOf(userId)).toBe(100000n)
  })

  it('приёмка этапа: внёс 1000, потратил 300, внёс 500 → доступно 1200', async () => {
    const { userId } = await seed()
    const cardId = await addCard({ userId, isPrimary: true })
    const port = fakeLimitPort()
    const { addressId } = await addressOf(userId)

    await registerIncoming(prisma, port, {
      chainTxId: 'a',
      addressId,
      receivedMinor: 100000n,
      ...PASSED,
    })
    await applyAuthorization(prisma, {
      id: 'ctx-1',
      cardId,
      amountMinor: 30000n,
      occurredAt: new Date(),
    })
    await applySettlement(prisma, { id: 'ctx-1', settledMinor: 30000n })
    await registerIncoming(prisma, port, {
      chainTxId: 'b',
      addressId,
      receivedMinor: 50000n,
      ...PASSED,
    })

    // Доступно ровно 1200 — это и есть число из критерия приёмки.
    expect(await remainingOfCard(cardId)).toBe(120000n)

    // А потолок при этом 1500: потрачено 300 плюс доступные 1200.
    // Счётчик потраченного не сбрасывается никогда, поэтому потолок
    // всегда выше доступного на величину трат (CLAUDE.md, правило 3).
    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } })
    expect(card.appliedLimit).toBe(150000n)
    expect(card.settledMinor).toBe(30000n)
  })

  it('№21: не прошедшее проверку происхождения не создаёт проводку', async () => {
    const { userId } = await seed()
    const cardId = await addCard({ userId, isPrimary: true })
    const port = fakeLimitPort()
    const { addressId } = await addressOf(userId)

    const result = await registerIncoming(prisma, port, {
      chainTxId: 'tx-bad',
      addressId,
      receivedMinor: 60000n,
      amlVerdict: 'FAILED',
      amlRisk: 95,
    })

    expect(result.status).toBe('HELD')
    expect(result.reasonCode).toBe('AML_FAILED')
    expect(await balanceOf(userId)).toBe(0n) // ни копейки
    expect(await remainingOfCard(cardId)).toBe(0n)
    expect(await prisma.ledgerTransaction.count()).toBe(0)
  })

  it('№21: риск выше порога — это тоже «не прошло»', async () => {
    const { userId } = await seed({ amlMaxRisk: 70 })
    await addCard({ userId, isPrimary: true })
    const { addressId } = await addressOf(userId)

    const result = await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-risky',
      addressId,
      receivedMinor: 60000n,
      amlVerdict: 'PASSED',
      amlRisk: 71,
    })

    expect(result.status).toBe('HELD')
    expect(await balanceOf(userId)).toBe(0n)
  })

  it('№22: недоступная проверка при выключенном «зачислять без неё» ставит в очередь', async () => {
    const { userId } = await seed({ creditWithoutAml: false })
    await addCard({ userId, isPrimary: true })
    const { addressId } = await addressOf(userId)

    const result = await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-unknown',
      addressId,
      receivedMinor: 60000n,
      amlVerdict: 'UNAVAILABLE',
    })

    expect(result.status).toBe('SUBMITTED')
    expect(result.reasonCode).toBe('AML_UNAVAILABLE')
    expect(await balanceOf(userId)).toBe(0n)
    expect(await prisma.ledgerTransaction.count()).toBe(0)
  })

  it('№22: включённый переключатель зачисляет и без проверки', async () => {
    const { userId } = await seed({ creditWithoutAml: true })
    await addCard({ userId, isPrimary: true })
    const { addressId } = await addressOf(userId)

    const result = await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-unknown',
      addressId,
      receivedMinor: 60000n,
      amlVerdict: 'UNAVAILABLE',
    })

    expect(result.status).toBe('CREDITED')
    expect(await balanceOf(userId)).toBe(60000n)
  })

  it('№23: повторное событие по той же транзакции не создаёт вторую проводку', async () => {
    const { userId } = await seed()
    const cardId = await addCard({ userId, isPrimary: true })
    const port = fakeLimitPort()
    const { addressId } = await addressOf(userId)

    const incoming = { chainTxId: 'tx-dup', addressId, receivedMinor: 60000n, ...PASSED }
    const first = await registerIncoming(prisma, port, incoming)
    const second = await registerIncoming(prisma, port, incoming)

    expect(second.requestId).toBe(first.requestId)
    expect(await prisma.ledgerTransaction.count()).toBe(1)
    expect(await balanceOf(userId)).toBe(60000n) // не 120 000
    expect(await remainingOfCard(cardId)).toBe(60000n)
  })

  it('№27: выключенный минимум не превращается в «минимум 0»', async () => {
    const { userId } = await seed({ minDepositOn: false, minDepositMinor: 10000n })
    await addCard({ userId, isPrimary: true })
    const { addressId } = await addressOf(userId)

    const result = await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-small',
      addressId,
      receivedMinor: 1n, // одна копейка
      ...PASSED,
    })

    expect(result.status).toBe('CREDITED')
    expect(await balanceOf(userId)).toBe(1n)
  })

  it('включённый минимум отправляет сумму ниже него оператору, а не отклоняет', async () => {
    const { userId } = await seed({ minDepositOn: true, minDepositMinor: 10000n })
    await addCard({ userId, isPrimary: true })
    const { addressId } = await addressOf(userId)

    const result = await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-small',
      addressId,
      receivedMinor: 9999n,
      ...PASSED,
    })

    expect(result.status).toBe('SUBMITTED') // в очередь, деньги не пропали
    expect(result.reasonCode).toBe('BELOW_MINIMUM')
    expect(await balanceOf(userId)).toBe(0n)
  })

  it('ручной режим ставит в очередь всё', async () => {
    const { userId } = await seed({ autoCreditOn: false })
    await addCard({ userId, isPrimary: true })
    const { addressId } = await addressOf(userId)

    const result = await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-manual',
      addressId,
      receivedMinor: 60000n,
      ...PASSED,
    })
    expect(result.status).toBe('SUBMITTED')
    expect(result.reasonCode).toBe('MANUAL_MODE')
  })

  it('№17: при главной карте в CLOSING деньги не идут на неё', async () => {
    const { userId } = await seed()
    const closing = await addCard({ userId, isPrimary: true, status: 'CLOSING' })
    const port = fakeLimitPort()
    const { addressId } = await addressOf(userId)

    await registerIncoming(prisma, port, {
      chainTxId: 'tx-c1',
      addressId,
      receivedMinor: 60000n,
      ...PASSED,
    })

    // Деньги в балансе есть, но лежат нераспределёнными.
    expect(await balanceOf(userId)).toBe(60000n)
    expect(await remainingOfCard(closing)).toBe(0n)
    expect(port.calls).toHaveLength(0)

    // Назначили новую главную — следующее зачисление идёт на неё.
    const fresh = await addCard({ userId, isPrimary: true })
    await prisma.card.update({ where: { id: closing }, data: { isPrimary: false } })
    await registerIncoming(prisma, port, {
      chainTxId: 'tx-c2',
      addressId,
      receivedMinor: 10000n,
      ...PASSED,
    })

    expect(await remainingOfCard(fresh)).toBe(10000n)
    expect(await remainingOfCard(closing)).toBe(0n)
  })

  it('№8: индивидуальная ставка заменяет глобальную и фиксируется в проводке', async () => {
    const { userId } = await seed({ depositFeeBps: 150, userDepositFeeBps: 50 })
    await addCard({ userId, isPrimary: true })
    const { addressId } = await addressOf(userId)

    await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-fee',
      addressId,
      receivedMinor: 100000n,
      ...PASSED,
    })

    // 0.5%, а не 1.5% и не 2%.
    expect(await balanceOf(userId)).toBe(99500n)
    const tx = await prisma.ledgerTransaction.findFirstOrThrow()
    expect(tx.feeBpsUsed).toBe(50)

    const fee = await prisma.ledgerEntry.findFirstOrThrow({ where: { account: 'FEE_INCOME' } })
    expect(fee.amountMinor).toBe(500n)
  })

  it('№11: сумма записей проводки в базе равна нулю', async () => {
    const { userId } = await seed({ depositFeeBps: 150 })
    await addCard({ userId, isPrimary: true })
    const { addressId } = await addressOf(userId)

    await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-zero',
      addressId,
      receivedMinor: 100000n,
      ...PASSED,
    })

    const entries = await prisma.ledgerEntry.findMany()
    expect(entries.length).toBeGreaterThanOrEqual(3)
    expect(entries.reduce((sum, e) => sum + e.amountMinor, 0n)).toBe(0n)
  })
})

describe('разбор оператором', () => {
  it('№24: два одновременных подтверждения дают одну проводку', async () => {
    const { userId } = await seed({ autoCreditOn: false })
    await addCard({ userId, isPrimary: true })
    const { addressId } = await addressOf(userId)
    const port = fakeLimitPort()

    const queued = await registerIncoming(prisma, port, {
      chainTxId: 'tx-race',
      addressId,
      receivedMinor: 60000n,
      ...PASSED,
    })

    const input = { requestId: queued.requestId, operatorId: 'op-1', receivedMinor: 60000n }
    const [a, b] = await Promise.all([
      confirmDeposit(prisma, port, input),
      confirmDeposit(prisma, port, { ...input, operatorId: 'op-2' }),
    ])

    // Обе половины гонки получили один и тот же результат.
    expect(a.ledgerTransactionId).toBe(b.ledgerTransactionId)
    expect([a.alreadyCredited, b.alreadyCredited].filter(Boolean)).toHaveLength(1)

    expect(await prisma.ledgerTransaction.count()).toBe(1)
    expect(await balanceOf(userId)).toBe(60000n) // не 120 000
  })

  it('№25: подтверждение уже зачисленной заявки не создаёт вторую проводку', async () => {
    const { userId } = await seed({ autoCreditOn: false })
    await addCard({ userId, isPrimary: true })
    const { addressId } = await addressOf(userId)
    const port = fakeLimitPort()

    const queued = await registerIncoming(prisma, port, {
      chainTxId: 'tx-twice',
      addressId,
      receivedMinor: 60000n,
      ...PASSED,
    })
    const input = { requestId: queued.requestId, operatorId: 'op-1', receivedMinor: 60000n }

    const first = await confirmDeposit(prisma, port, input)
    const second = await confirmDeposit(prisma, port, input)

    expect(second.alreadyCredited).toBe(true)
    expect(second.ledgerTransactionId).toBe(first.ledgerTransactionId)
    expect(await prisma.ledgerTransaction.count()).toBe(1)
    expect(await balanceOf(userId)).toBe(60000n)
  })

  it('заявку в состоянии REFUNDED зачислять нельзя', async () => {
    const { userId } = await seed()
    const { addressId } = await addressOf(userId)
    const held = await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-ref',
      addressId,
      receivedMinor: 60000n,
      fromAddress: 'TSender',
      amlVerdict: 'FAILED',
      amlRisk: 99,
    })
    await markRefunded(prisma, held.requestId)

    await expect(
      confirmDeposit(prisma, fakeLimitPort(), {
        requestId: held.requestId,
        operatorId: 'op-1',
        receivedMinor: 60000n,
      }),
    ).rejects.toThrow(DepositError)
  })

  it('захват заявки не даёт второму оператору её разобрать', async () => {
    const { userId } = await seed({ autoCreditOn: false })
    const { addressId } = await addressOf(userId)
    const queued = await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-claim',
      addressId,
      receivedMinor: 60000n,
      ...PASSED,
    })

    expect(await claimDeposit(prisma, queued.requestId, 'op-1')).toEqual({
      claimed: true,
      claimedBy: 'op-1',
    })
    expect(await claimDeposit(prisma, queued.requestId, 'op-2')).toEqual({
      claimed: false,
      claimedBy: 'op-1',
    })
  })

  it('протухший захват освобождает заявку', async () => {
    const { userId } = await seed({ autoCreditOn: false })
    const { addressId } = await addressOf(userId)
    const queued = await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-stale',
      addressId,
      receivedMinor: 60000n,
      ...PASSED,
    })

    await claimDeposit(prisma, queued.requestId, 'op-1')
    // Оператор ушёл на обед: захват протух.
    const later = new Date(Date.now() + CLAIM_TTL_MS + 1000)
    const second = await claimDeposit(prisma, queued.requestId, 'op-2', later)
    expect(second.claimed).toBe(true)
  })
})

describe('возврат отправителю', () => {
  it('№26: возврат не создаёт проводок и не меняет баланс', async () => {
    const { userId } = await seed()
    await addCard({ userId, isPrimary: true })
    const { addressId } = await addressOf(userId)

    const held = await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-held',
      addressId,
      receivedMinor: 60000n,
      fromAddress: 'TSenderAddress',
      amlVerdict: 'FAILED',
      amlRisk: 99,
    })

    const refund = await markRefunded(prisma, held.requestId)

    // Получатель ровно один — адрес, с которого пришли деньги.
    expect(refund.toAddress).toBe('TSenderAddress')
    expect(await prisma.ledgerTransaction.count()).toBe(0)
    expect(await balanceOf(userId)).toBe(0n)

    // Адрес уничтожен и больше не используется.
    const address = await prisma.depositAddress.findUniqueOrThrow({ where: { id: addressId } })
    expect(address.status).toBe('BURNED')
    expect(address.burnReason).toBe('REFUNDED')
  })

  it('без адреса отправителя возвращать некуда', async () => {
    const { userId } = await seed()
    const { addressId } = await addressOf(userId)
    const held = await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-noaddr',
      addressId,
      receivedMinor: 60000n,
      amlVerdict: 'FAILED',
      amlRisk: 99,
    })
    await expect(markRefunded(prisma, held.requestId)).rejects.toThrow(DepositError)
  })
})

/** Адрес, заведённый сидом для этого пользователя. */
async function addressOf(userId: string): Promise<{ addressId: string }> {
  const address = await prisma.depositAddress.findFirstOrThrow({ where: { userId } })
  return { addressId: address.id }
}

/**
 * Зеркало транзакций: авторизации, сеттлмент, возвраты, чужая валюта.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { applyAuthorization, applyRefund, applySettlement, refreshFromIssuer } from '@/server/services/mirror'
import { registerIncoming } from '@/server/services/deposits'
import { addCard, balanceOf, fakeLimitPort, prisma, remainingOfCard, resetDb, seed } from './helpers'

beforeEach(resetDb)
afterAll(async () => {
  await prisma.$disconnect()
})

const PASSED = { amlVerdict: 'PASSED' as const, amlRisk: 5 }

async function fundedCard(amount = 100000n) {
  const seeded = await seed()
  const cardId = await addCard({ userId: seeded.userId, isPrimary: true })
  await registerIncoming(prisma, fakeLimitPort(), {
    chainTxId: 'tx-fund',
    addressId: seeded.addressId,
    receivedMinor: amount,
    ...PASSED,
  })
  return { ...seeded, cardId }
}

describe('траты в чужой валюте', () => {
  it('№18: проводка идёт по сеттлменту, а не по авторизации', async () => {
    const { userId, cardId } = await fundedCard()

    // Авторизация: 110 евро, по курсу на тот момент — 120.50 USD.
    await applyAuthorization(prisma, {
      id: 'ctx-1',
      cardId,
      amountMinor: 12050n,
      localAmount: 11000n,
      localCurrency: 'EUR',
      merchantName: 'HOTEL ARTEMIDE ROMA',
      occurredAt: new Date(),
    })

    // Проводки ещё нет: авторизация ставит резерв, деньги не списаны.
    expect(await prisma.ledgerTransaction.count({ where: { type: 'SPEND' } })).toBe(0)
    expect(await balanceOf(userId)).toBe(100000n)
    expect(await remainingOfCard(cardId)).toBe(87950n)

    // Пока операция оседала, курс ушёл: списали 121.80.
    await applySettlement(prisma, { id: 'ctx-1', settledMinor: 12180n })

    // Проводка — по фактической сумме. Курсовая разница в 1.30 не
    // потеряна и не удвоена.
    expect(await balanceOf(userId)).toBe(100000n - 12180n)
    expect(await remainingOfCard(cardId)).toBe(100000n - 12180n)

    const spend = await prisma.ledgerTransaction.findFirstOrThrow({ where: { type: 'SPEND' } })
    const entries = await prisma.ledgerEntry.findMany({ where: { transactionId: spend.id } })
    expect(entries.find((e) => e.account === `USER:${userId}`)?.amountMinor).toBe(-12180n)
    expect(entries.reduce((sum, e) => sum + e.amountMinor, 0n)).toBe(0n)
  })

  it('№19: сумма авторизации сохраняется и не затирается чтением', async () => {
    const { cardId } = await fundedCard()

    await applyAuthorization(prisma, {
      id: 'ctx-1',
      cardId,
      amountMinor: 12050n,
      localAmount: 11000n,
      localCurrency: 'EUR',
      occurredAt: new Date(),
    })
    await applySettlement(prisma, { id: 'ctx-1', settledMinor: 12180n })

    let tx = await prisma.cardTransaction.findUniqueOrThrow({ where: { id: 'ctx-1' } })
    expect(tx.amountMinor).toBe(12180n) // фактическая
    expect(tx.authorizedAmount).toBe(12050n) // исходная, из события
    expect(tx.authorizedLocalAmount).toBe(11000n)

    // Перечитали транзакцию у эмитента: там authorizedAmount уже
    // затёрт фактической суммой. У нас он обязан остаться прежним —
    // иначе не отличить курсовую разницу от чаевых.
    await refreshFromIssuer(prisma, { id: 'ctx-1', amountMinor: 12180n, status: 'SETTLED' })

    tx = await prisma.cardTransaction.findUniqueOrThrow({ where: { id: 'ctx-1' } })
    expect(tx.authorizedAmount).toBe(12050n)
    expect(tx.authorizedLocalAmount).toBe(11000n)
  })

  it('№20: возврат проводится по фактически полученной сумме', async () => {
    const { userId, cardId } = await fundedCard()

    await applyAuthorization(prisma, {
      id: 'ctx-1',
      cardId,
      amountMinor: 12050n,
      localAmount: 11000n,
      localCurrency: 'EUR',
      occurredAt: new Date(),
    })
    await applySettlement(prisma, { id: 'ctx-1', settledMinor: 12050n })
    expect(await balanceOf(userId)).toBe(87950n)

    // Вернули те же 110 евро, но курс сдвинулся: пришло 118.40.
    await applyRefund(prisma, {
      id: 'ctx-1-refund',
      cardId,
      receivedMinor: 11840n,
      localAmount: 11000n,
      localCurrency: 'EUR',
      occurredAt: new Date(),
    })

    // Проводка по полученному, а не по сумме покупки. Разница в 2.10 —
    // реальный результат конвертации, компенсировать её нечем.
    expect(await balanceOf(userId)).toBe(87950n + 11840n)
    expect(await remainingOfCard(cardId)).toBe(99790n)
  })

  it('№16: авторизация, осевшая после переноса свободной части, не уводит карту в минус', async () => {
    const { cardId } = await fundedCard(100000n)

    // Одобрено 300, но ещё не списано.
    await applyAuthorization(prisma, {
      id: 'ctx-1',
      cardId,
      amountMinor: 30000n,
      occurredAt: new Date(),
    })
    // Свободно ровно 700 — резерв уже вычтен.
    expect(await remainingOfCard(cardId)).toBe(70000n)

    // Унесли всю свободную часть.
    const port = fakeLimitPort()
    const { setCardRemaining } = await import('@/server/services/cards')
    await setCardRemaining(prisma, port, cardId, 0n)
    expect(await remainingOfCard(cardId)).toBe(0n)

    // И только теперь авторизация осела.
    await applySettlement(prisma, { id: 'ctx-1', settledMinor: 30000n })

    // Карта в нуле, а не в минусе: резерв перешёл в потраченное
    // один к одному.
    expect(await remainingOfCard(cardId)).toBe(0n)
    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } })
    expect(card.pendingMinor).toBe(0n)
    expect(card.settledMinor).toBe(30000n)
  })

  it('№10: повторная доставка события не удваивает проводку', async () => {
    const { userId, cardId } = await fundedCard()

    await applyAuthorization(prisma, {
      id: 'ctx-1',
      cardId,
      amountMinor: 5000n,
      occurredAt: new Date(),
    })
    // Событие авторизации пришло дважды — резерв не удваивается.
    await applyAuthorization(prisma, {
      id: 'ctx-1',
      cardId,
      amountMinor: 5000n,
      occurredAt: new Date(),
    })
    expect(await remainingOfCard(cardId)).toBe(95000n)

    const first = await applySettlement(prisma, { id: 'ctx-1', settledMinor: 5000n })
    const second = await applySettlement(prisma, { id: 'ctx-1', settledMinor: 5000n })

    expect(second.alreadyExisted).toBe(true)
    expect(second.ledgerTransactionId).toBe(first.ledgerTransactionId)
    expect(await prisma.ledgerTransaction.count({ where: { type: 'SPEND' } })).toBe(1)
    expect(await balanceOf(userId)).toBe(95000n) // не 90 000
  })
})

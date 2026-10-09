/**
 * Перевод между картами и инварианты платёжеспособности на живой базе.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { InvariantError } from '@/server/domain/invariants'
import { setCardRemaining } from '@/server/services/cards'
import { resumeTransfer, transfer, TransferError } from '@/server/services/transfers'
import { registerIncoming } from '@/server/services/deposits'
import { addCard, balanceOf, fakeLimitPort, prisma, remainingOfCard, resetDb, seed } from './helpers'

beforeEach(resetDb)
afterAll(async () => {
  await prisma.$disconnect()
})

const PASSED = { amlVerdict: 'PASSED' as const, amlRisk: 5 }

async function fundedUser(options: { amount?: bigint; pool?: bigint } = {}) {
  const seeded = await seed({ poolMinor: options.pool ?? 100_000_000n })
  const primary = await addCard({ userId: seeded.userId, isPrimary: true })
  const child = await addCard({ userId: seeded.userId })
  const port = fakeLimitPort()
  await registerIncoming(prisma, port, {
    chainTxId: 'tx-fund',
    addressId: seeded.addressId,
    receivedMinor: options.amount ?? 100000n,
    ...PASSED,
  })
  return { ...seeded, primary, child, port }
}

describe('перевод между картами', () => {
  it('№3: сумма остатков по картам не меняется', async () => {
    const { userId, primary, child, port } = await fundedUser()

    const before = (await remainingOfCard(primary)) + (await remainingOfCard(child))
    const result = await transfer(prisma, port, {
      userId,
      fromCardId: primary,
      toCardId: child,
      amountMinor: 20000n,
    })

    expect(result.status).toBe('COMPLETED')
    expect(await remainingOfCard(primary)).toBe(80000n)
    expect(await remainingOfCard(child)).toBe(20000n)
    expect((await remainingOfCard(primary)) + (await remainingOfCard(child))).toBe(before)
  })

  it('№3: перевод не создаёт проводок — баланс пользователя не меняется', async () => {
    const { userId, primary, child, port } = await fundedUser()
    const before = await prisma.ledgerTransaction.count()

    await transfer(prisma, port, {
      userId,
      fromCardId: primary,
      toCardId: child,
      amountMinor: 20000n,
    })

    expect(await prisma.ledgerTransaction.count()).toBe(before)
  })

  it('№4: сбой второго вызова не создаёт денег, перевод добирается', async () => {
    const { userId, primary, child, port } = await fundedUser()

    // Источник уменьшится, а получателя поднять не выйдет.
    port.failNext = false
    let calls = 0
    const flaky = {
      async setLimit(oxenCardId: string, limit: bigint) {
        calls += 1
        if (calls === 2) throw new Error('эмитент недоступен')
        await port.setLimit(oxenCardId, limit)
      },
    }

    const half = await transfer(prisma, flaky, {
      userId,
      fromCardId: primary,
      toCardId: child,
      amountMinor: 20000n,
    })

    expect(half.status).toBe('SOURCE_REDUCED')
    // Деньги сняты с источника и не зачислены получателю. Это временная
    // недоступность, а не появление денег из воздуха: суммарно стало
    // МЕНЬШЕ, а не больше.
    expect(await remainingOfCard(primary)).toBe(80000n)
    expect(await remainingOfCard(child)).toBe(0n)

    const resumed = await resumeTransfer(prisma, port, half.transferId)
    expect(resumed.status).toBe('COMPLETED')
    expect(await remainingOfCard(primary)).toBe(80000n)
    expect(await remainingOfCard(child)).toBe(20000n)

    // Повтор по завершённому переводу ничего не повторяет.
    const again = await resumeTransfer(prisma, port, half.transferId)
    expect(again.status).toBe('COMPLETED')
    expect(await remainingOfCard(child)).toBe(20000n)
  })

  it('сбой ПЕРВОГО вызова оставляет деньги на источнике', async () => {
    const { userId, primary, child, port } = await fundedUser()
    port.failAlways = true

    const failed = await transfer(prisma, port, {
      userId,
      fromCardId: primary,
      toCardId: child,
      amountMinor: 20000n,
    })

    expect(failed.status).toBe('FAILED')
    expect(await remainingOfCard(primary)).toBe(100000n)
    expect(await remainingOfCard(child)).toBe(0n)
  })

  it('нельзя унести с карты больше, чем на ней свободно', async () => {
    const { userId, primary, child, port } = await fundedUser()
    await expect(
      transfer(prisma, port, {
        userId,
        fromCardId: primary,
        toCardId: child,
        amountMinor: 100001n,
      }),
    ).rejects.toThrow(TransferError)
  })

  it('на закрывающуюся карту переводить нельзя', async () => {
    const { userId, primary, child, port } = await fundedUser()
    await prisma.card.update({ where: { id: child }, data: { status: 'CLOSING' } })
    await expect(
      transfer(prisma, port, { userId, fromCardId: primary, toCardId: child, amountMinor: 1000n }),
    ).rejects.toThrow(TransferError)
  })
})

describe('инварианты на живой базе', () => {
  it('№5: лимит нельзя поднять выше баланса пользователя', async () => {
    const { userId, primary, port } = await fundedUser({ amount: 100000n })

    // Ровно по балансу — можно.
    await setCardRemaining(prisma, port, primary, 100000n)
    expect(await remainingOfCard(primary)).toBe(100000n)

    // На копейку выше — нельзя: иначе он потратит свои деньги дважды.
    await expect(setCardRemaining(prisma, port, primary, 100001n)).rejects.toThrow(InvariantError)
    expect(await remainingOfCard(primary)).toBe(100000n)
  })

  it('№5: вторая карта не даёт потратить те же деньги ещё раз', async () => {
    const { userId, primary, child, port } = await fundedUser({ amount: 100000n })
    await setCardRemaining(prisma, port, primary, 100000n)

    await expect(setCardRemaining(prisma, port, child, 1n)).rejects.toThrow(InvariantError)
  })

  it('№6: пул проверяется по своей компании, а не по холдингу', async () => {
    // Своя компания с маленьким пулом.
    const alpha = await seed({ poolMinor: 50000n })
    const alphaCard = await addCard({ userId: alpha.userId, isPrimary: true })
    const port = fakeLimitPort()
    await registerIncoming(prisma, port, {
      chainTxId: 'tx-alpha',
      addressId: alpha.addressId,
      receivedMinor: 100000n,
      ...PASSED,
    })

    // Соседняя компания с огромным пулом — она не должна ничего
    // покрывать за первую.
    const beta = await prisma.company.create({
      data: {
        name: 'Holding Beta',
        oxenClientId: 'cl_beta',
        poolAvailableMinor: 100_000_000n,
      },
    })
    const betaUser = await prisma.user.create({
      data: { companyId: beta.id, fullName: 'Петров Пётр', status: 'ACTIVE' },
    })
    await addCard({ userId: betaUser.id, isPrimary: true })

    // Зачисление прошло целиком: деньги человека, отказывать нельзя.
    // А на карту поднялось только то, что выдерживает пул СВОЕЙ
    // компании, — остальное лежит нераспределённым.
    expect(await balanceOf(alpha.userId)).toBe(100000n)
    expect(await remainingOfCard(alphaCard)).toBe(50000n)

    // Поднять выше пула нельзя даже вручную, и огромный пул соседа
    // в этом не помогает.
    await expect(setCardRemaining(prisma, port, alphaCard, 60000n)).rejects.toThrow(InvariantError)
    expect(await remainingOfCard(alphaCard)).toBe(50000n)
  })
})

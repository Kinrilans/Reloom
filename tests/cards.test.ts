/**
 * Карты: слоты, заморозка по минусу, доступное к тратам.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  availableToSpend,
  hasFreeSlot,
  occupiesSlot,
  syncFreezeWithBalance,
  unallocated,
} from '@/server/services/cards'
import { registerIncoming } from '@/server/services/deposits'
import { applyAuthorization, applySettlement } from '@/server/services/mirror'
import { addCard, balanceOf, fakeLimitPort, prisma, remainingOfCard, resetDb, seed } from './helpers'

beforeEach(resetDb)
afterAll(async () => {
  await prisma.$disconnect()
})

const PASSED = { amlVerdict: 'PASSED' as const, amlRisk: 5 }

describe('слоты карт', () => {
  it('№14: отменённые карты слот не занимают', async () => {
    const { userId } = await seed({ maxActiveCards: 2 })
    await addCard({ userId, isPrimary: true })
    const second = await addCard({ userId })

    expect(await hasFreeSlot(prisma, userId)).toBe(false)

    await prisma.card.update({ where: { id: second }, data: { status: 'CANCELED' } })
    expect(await hasFreeSlot(prisma, userId)).toBe(true)

    expect(occupiesSlot('CANCELED')).toBe(false)
    // Закрывающаяся слот ЗАНИМАЕТ: она ещё не отменена, по ней может
    // осесть операция, и вернуть её в работу пока можно.
    expect(occupiesSlot('CLOSING')).toBe(true)
    expect(occupiesSlot('FROZEN')).toBe(true)
  })
})

describe('заморозка по минусу', () => {
  it('№9: минус замораживает все карты, плюс размораживает только их', async () => {
    const { userId, addressId } = await seed()
    const primary = await addCard({ userId, isPrimary: true })
    const child = await addCard({ userId })
    const byUser = await addCard({ userId, status: 'FROZEN' })
    await prisma.card.update({ where: { id: byUser }, data: { freezeReason: 'BY_USER' } })

    const port = fakeLimitPort()
    await registerIncoming(prisma, port, {
      chainTxId: 'tx-1',
      addressId,
      receivedMinor: 10000n,
      ...PASSED,
    })

    // Списание выше остатка: чаевые, поздний счёт, курсовая разница.
    await applyAuthorization(prisma, {
      id: 'ctx-1',
      cardId: primary,
      amountMinor: 10000n,
      occurredAt: new Date(),
    })
    await applySettlement(prisma, { id: 'ctx-1', settledMinor: 10500n })

    expect(await balanceOf(userId)).toBe(-500n)

    const frozen = await prisma.card.findMany({ where: { userId } })
    for (const card of frozen) {
      expect(card.status).toBe('FROZEN')
    }
    expect(frozen.find((c) => c.id === primary)?.freezeReason).toBe('NEGATIVE_BALANCE')
    expect(frozen.find((c) => c.id === child)?.freezeReason).toBe('NEGATIVE_BALANCE')
    // Ручную заморозку минус не переписывает.
    expect(frozen.find((c) => c.id === byUser)?.freezeReason).toBe('BY_USER')

    // Пополнение выводит в плюс.
    await registerIncoming(prisma, port, {
      chainTxId: 'tx-2',
      addressId,
      receivedMinor: 1000n,
      ...PASSED,
    })
    expect(await balanceOf(userId)).toBe(500n)

    const after = await prisma.card.findMany({ where: { userId } })
    expect(after.find((c) => c.id === primary)?.status).toBe('ACTIVE')
    expect(after.find((c) => c.id === child)?.status).toBe('ACTIVE')
    // А вот эту замораживал не минус — зачисление её не трогает.
    expect(after.find((c) => c.id === byUser)?.status).toBe('FROZEN')
    expect(after.find((c) => c.id === byUser)?.freezeReason).toBe('BY_USER')
  })

  it('ноль на балансе — это уже не минус', async () => {
    const { userId } = await seed()
    const cardId = await addCard({ userId, isPrimary: true, status: 'FROZEN' })
    await prisma.card.update({ where: { id: cardId }, data: { freezeReason: 'NEGATIVE_BALANCE' } })

    await prisma.$transaction((tx) => syncFreezeWithBalance(tx, userId))

    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } })
    expect(card.status).toBe('ACTIVE')
  })
})

describe('доступное к тратам', () => {
  it('№7: незакрытая авторизация уменьшает доступное', async () => {
    const { userId, addressId } = await seed()
    const cardId = await addCard({ userId, isPrimary: true })
    const port = fakeLimitPort()

    await registerIncoming(prisma, port, {
      chainTxId: 'tx-1',
      addressId,
      receivedMinor: 100000n,
      ...PASSED,
    })
    expect(await availableToSpend(prisma, userId)).toBe(100000n)

    // Одобрено, но ещё не списано: деньги уже обещаны мерчанту.
    await applyAuthorization(prisma, {
      id: 'ctx-1',
      cardId,
      amountMinor: 25000n,
      occurredAt: new Date(),
    })

    expect(await availableToSpend(prisma, userId)).toBe(75000n)
    // Баланс при этом ещё не тронут: проводки нет, деньги не списаны.
    expect(await balanceOf(userId)).toBe(100000n)
    expect(await remainingOfCard(cardId)).toBe(75000n)
  })

  it('до выпуска карты деньги лежат нераспределёнными', async () => {
    const { userId, addressId } = await seed()
    await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-1',
      addressId,
      receivedMinor: 50000n,
      ...PASSED,
    })

    expect(await balanceOf(userId)).toBe(50000n)
    expect(await availableToSpend(prisma, userId)).toBe(0n)
    expect(await unallocated(prisma, userId)).toBe(50000n)
  })
})

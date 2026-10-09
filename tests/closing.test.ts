/**
 * Закрытие карты — через заморозку.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { advanceClosing, cancelClosing, startClosing, ClosingError } from '@/server/services/closing'
import { registerIncoming } from '@/server/services/deposits'
import { applyAuthorization, applySettlement } from '@/server/services/mirror'
import {
  addCard,
  balanceOf,
  fakeIssuePort,
  fakeLimitPort,
  fakeStatePort,
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

async function twoCards(amount = 100000n) {
  const seeded = await seed()
  const primary = await addCard({ userId: seeded.userId, isPrimary: true })
  const child = await addCard({ userId: seeded.userId })
  await registerIncoming(prisma, fakeLimitPort(), {
    chainTxId: 'tx-fund',
    addressId: seeded.addressId,
    receivedMinor: amount,
    ...PASSED,
  })
  return { ...seeded, primary, child }
}

describe('закрытие карты', () => {
  it('№13: остаток переносится и не теряется', async () => {
    const { userId, primary, child } = await twoCards()
    const ports = { limit: fakeLimitPort(), state: fakeStatePort(), issue: fakeIssuePort() }

    const before = (await remainingOfCard(primary)) + (await remainingOfCard(child))

    await startClosing(prisma, ports.state, {
      cardId: primary,
      plan: { kind: 'TO_CARD', cardId: child },
    })
    const progress = await advanceClosing(prisma, ports, primary)

    expect(progress.canceled).toBe(true)
    expect(progress.movedMinor).toBe(100000n)
    expect(await remainingOfCard(child)).toBe(100000n)
    expect((await remainingOfCard(primary)) + (await remainingOfCard(child))).toBe(before)
    // Баланс пользователя закрытием не меняется: это не движение денег.
    expect(await balanceOf(userId)).toBe(100000n)

    const card = await prisma.card.findUniqueOrThrow({ where: { id: primary } })
    expect(card.status).toBe('CANCELED')
    expect(ports.state.canceled).toHaveLength(1)
  })

  it('№13: при сбое выпуска новой карты старая не отменяется', async () => {
    const { primary } = await twoCards()
    const ports = {
      limit: fakeLimitPort(),
      state: fakeStatePort(),
      issue: fakeIssuePort({ fail: true }),
    }

    await startClosing(prisma, ports.state, { cardId: primary, plan: { kind: 'ISSUE_NEW' } })
    await expect(advanceClosing(prisma, ports, primary)).rejects.toThrow('выпуск карты не удался')

    const card = await prisma.card.findUniqueOrThrow({ where: { id: primary } })
    expect(card.status).toBe('CLOSING') // не CANCELED
    expect(await remainingOfCard(primary)).toBe(100000n) // деньги на месте
    expect(ports.state.canceled).toHaveLength(0)

    // Эмитент починился — закрытие доводится повтором.
    const working = { ...ports, issue: fakeIssuePort() }
    const progress = await advanceClosing(prisma, working, primary)
    expect(progress.canceled).toBe(true)
    expect(working.issue.issued).toBe(1)
  })

  it('№15: карта с незакрытыми авторизациями не отменяется, резерв не переносится', async () => {
    const { primary, child } = await twoCards()
    const ports = { limit: fakeLimitPort(), state: fakeStatePort(), issue: fakeIssuePort() }

    // Одобрено 300, ещё не списано.
    await applyAuthorization(prisma, {
      id: 'ctx-1',
      cardId: primary,
      amountMinor: 30000n,
      occurredAt: new Date(),
    })

    await startClosing(prisma, ports.state, {
      cardId: primary,
      plan: { kind: 'TO_CARD', cardId: child },
    })
    const progress = await advanceClosing(prisma, ports, primary)

    // Перенесена только свободная часть. Резерв остался на карте.
    expect(progress.movedMinor).toBe(70000n)
    expect(progress.canceled).toBe(false)
    expect(progress.blockers).toEqual(['PENDING_AUTHORIZATIONS'])
    expect(await remainingOfCard(child)).toBe(70000n)
    expect(ports.state.canceled).toHaveLength(0)

    const card = await prisma.card.findUniqueOrThrow({ where: { id: primary } })
    expect(card.status).toBe('CLOSING')
    expect(card.pendingMinor).toBe(30000n)

    // №16: авторизация осела — карта не ушла в минус, и только теперь
    // закрытие можно довести.
    await applySettlement(prisma, { id: 'ctx-1', settledMinor: 30000n })
    expect(await remainingOfCard(primary)).toBe(0n)

    const done = await advanceClosing(prisma, ports, primary)
    expect(done.canceled).toBe(true)
    expect(ports.state.canceled).toHaveLength(1)
  })

  it('закрытие можно отменить, пока карта не отменена', async () => {
    const { primary, child } = await twoCards()
    const state = fakeStatePort()

    await startClosing(prisma, state, { cardId: primary, plan: { kind: 'TO_CARD', cardId: child } })
    expect((await prisma.card.findUniqueOrThrow({ where: { id: primary } })).status).toBe('CLOSING')

    await cancelClosing(prisma, state, primary)
    const card = await prisma.card.findUniqueOrThrow({ where: { id: primary } })
    expect(card.status).toBe('ACTIVE')
    expect(card.freezeReason).toBeNull()
    expect(card.closingPlan).toBeNull()
  })

  it('отменённую карту закрывать нечего — отмена необратима', async () => {
    const { primary } = await twoCards()
    await prisma.card.update({ where: { id: primary }, data: { status: 'CANCELED' } })
    await expect(
      startClosing(prisma, fakeStatePort(), { cardId: primary, plan: { kind: 'ISSUE_NEW' } }),
    ).rejects.toThrow(ClosingError)
  })

  it('выпуск новой карты переносит на неё роль главной', async () => {
    const { userId, primary } = await twoCards()
    const ports = { limit: fakeLimitPort(), state: fakeStatePort(), issue: fakeIssuePort() }

    await startClosing(prisma, ports.state, { cardId: primary, plan: { kind: 'ISSUE_NEW' } })
    await advanceClosing(prisma, ports, primary)

    const primaries = await prisma.card.findMany({ where: { userId, isPrimary: true } })
    expect(primaries).toHaveLength(1) // главная ровно одна
    expect(primaries[0]?.id).not.toBe(primary)
    expect(await remainingOfCard(primaries[0]!.id)).toBe(100000n)
  })
})

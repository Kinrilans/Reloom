/**
 * Карты: лимиты, заморозка, слоты.
 *
 * Всё, что меняет потолок карты, проходит здесь — и здесь же стоят обе
 * проверки платёжеспособности. Проверять их «потом, сверкой» нельзя:
 * сверка находит нарушение после того, как деньги уже выданы.
 */

import type { Prisma } from '@/generated/prisma/client'
import type { Minor } from '@/shared/money'
import { checkCompanySolvency, checkUserSolvency } from '../domain/invariants'
import { freeToMove, limitForRemaining, remainingOf, spentOf, type CardMoney } from '../domain/limits'
import type { CardLimitPort } from '../domain/ports'
import { userBalance } from '../ledger'

export class CardError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'CardError'
    this.code = code
  }
}

/** Карта считается живой, пока её не отменили. */
export const LIVE_STATUSES = ['ACTIVE', 'FROZEN', 'CLOSING'] as const

/**
 * Карты, занимающие слот из лимита в N активных.
 *
 * Отменённые слот **не занимают**: иначе скомпрометированная карта
 * навсегда съедала бы его, и человек остался бы с одной картой на всю
 * жизнь аккаунта.
 *
 * Закрывающаяся (`CLOSING`) слот занимает: она ещё не отменена, по ней
 * может осесть операция, и вернуть её в работу пока можно.
 */
export function occupiesSlot(status: string): boolean {
  return status !== 'CANCELED'
}

export function money(card: { appliedLimit: Minor; settledMinor: Minor; pendingMinor: Minor }): CardMoney {
  return { appliedLimit: card.appliedLimit, settled: card.settledMinor, pending: card.pendingMinor }
}

/**
 * Сколько активных карт можно иметь. Хранится в настройках, стартовое
 * значение — две (главная плюс дочерняя).
 */
export async function maxActiveCards(tx: Prisma.TransactionClient): Promise<number> {
  const settings = await tx.settings.findUnique({ where: { id: 'singleton' } })
  return settings?.maxActiveCards ?? 2
}

/** Есть ли свободный слот под новую карту. */
export async function hasFreeSlot(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const cards = await tx.card.findMany({ where: { userId }, select: { status: true } })
  const used = cards.filter((card) => occupiesSlot(card.status)).length
  return used < (await maxActiveCards(tx))
}

/**
 * Выставить карте такой потолок, чтобы остаток стал равен желаемому.
 *
 * Порядок принципиален: сначала проверки, потом вызов наружу, потом
 * запись у себя. Если сначала записать у себя, а вызов упадёт — наше
 * представление о лимите разойдётся с настоящим, и разойдётся молча.
 *
 * Обе проверки платёжеспособности считаются **на будущем состоянии**,
 * а не на текущем: смысл проверки в том, чтобы не дать перейти в плохое
 * состояние, а не в том, чтобы заметить, что мы уже в нём.
 */
export async function setCardRemaining(
  tx: Prisma.TransactionClient,
  port: CardLimitPort,
  cardId: string,
  desiredRemaining: Minor,
): Promise<Minor> {
  const card = await tx.card.findUnique({ where: { id: cardId } })
  if (!card) throw new CardError('CARD_NOT_FOUND', `Карты ${cardId} нет`)
  if (card.status === 'CANCELED') {
    throw new CardError('CARD_TERMINAL', 'Отменённой карте лимит не меняют: отмена необратима')
  }

  const newLimit = limitForRemaining(money(card), desiredRemaining)
  await assertSolvencyAfter(tx, card.userId, cardId, newLimit)

  await port.setLimit(card.oxenCardId, newLimit)
  await tx.card.update({ where: { id: cardId }, data: { appliedLimit: newLimit } })
  return newLimit
}

/**
 * Проверка обоих инвариантов на состоянии, которое получится после
 * изменения лимита карты `cardId` на `newLimit`.
 */
export async function assertSolvencyAfter(
  tx: Prisma.TransactionClient,
  userId: string,
  cardId: string,
  newLimit: Minor,
): Promise<void> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { companyId: true } })
  if (!user) throw new CardError('USER_NOT_FOUND', `Пользователя ${userId} нет`)

  const withNewLimit = (card: {
    id: string
    appliedLimit: Minor
    settledMinor: Minor
    pendingMinor: Minor
  }): CardMoney => (card.id === cardId ? { ...money(card), appliedLimit: newLimit } : money(card))

  const userCards = await tx.card.findMany({
    where: { userId, status: { in: [...LIVE_STATUSES] } },
  })
  checkUserSolvency(await userBalance(tx, userId), userCards.map(withNewLimit))

  const company = await tx.company.findUnique({ where: { id: user.companyId } })
  if (!company) throw new CardError('COMPANY_NOT_FOUND', `Компании ${user.companyId} нет`)

  const companyCards = await tx.card.findMany({
    where: { status: { in: [...LIVE_STATUSES] }, user: { companyId: user.companyId } },
  })
  checkCompanySolvency(company.poolAvailableMinor, companyCards.map(withNewLimit))
}

/* --------------------------------------------------------------------------
   Заморозка по минусу
   -------------------------------------------------------------------------- */

/**
 * Привести заморозку в соответствие с балансом.
 *
 * При любом минусе, даже копеечном, замораживаются **все** карты
 * пользователя. При выходе в ноль или плюс размораживаются **только
 * те, что были заморожены по этой причине**: ручная заморозка
 * пользователем или оператором сохраняется — её снимал не минус, и
 * снимать её зачислением нельзя.
 *
 * Ради этого и хранится причина заморозки.
 */
export async function syncFreezeWithBalance(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const balance = await userBalance(tx, userId)

  if (balance < 0n) {
    await tx.card.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'FROZEN', freezeReason: 'NEGATIVE_BALANCE' },
    })
    return
  }

  await tx.card.updateMany({
    where: { userId, status: 'FROZEN', freezeReason: 'NEGATIVE_BALANCE' },
    data: { status: 'ACTIVE', freezeReason: null },
  })
}

/* --------------------------------------------------------------------------
   Чтение
   -------------------------------------------------------------------------- */

/**
 * Доступно пользователю к тратам: сумма остатков по живым картам.
 *
 * Незакрытые авторизации уже вычтены внутри остатка, поэтому
 * одобренная, но не списанная покупка уменьшает доступное сразу — как
 * и должно быть: эти деньги уже обещаны мерчанту.
 */
export async function availableToSpend(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<Minor> {
  const cards = await tx.card.findMany({
    where: { userId, status: { in: [...LIVE_STATUSES] } },
  })
  return cards.reduce<Minor>((sum, card) => sum + remainingOf(money(card)), 0n)
}

/**
 * Нераспределённый остаток: внесено, но ещё не лежит ни на одной карте.
 *
 * В обычной работе это ноль. Не ноль — до выпуска первой карты и когда
 * главная карта закрывается, а новой ещё нет.
 */
export async function unallocated(tx: Prisma.TransactionClient, userId: string): Promise<Minor> {
  return (await userBalance(tx, userId)) - (await availableToSpend(tx, userId))
}

export { freeToMove, remainingOf, spentOf }

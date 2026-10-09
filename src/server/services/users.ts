/**
 * Пользователи: заведение, блокировка, индивидуальные ставки.
 *
 * Слов «сотрудник» и «удалить» здесь нет. Учётную запись можно только
 * **заблокировать**, и это обратимо: леджер и аудит — финансовая
 * отчётность, стирать её нельзя, а картхолдера у эмитента удалить
 * невозможно в принципе.
 *
 * Заведение у эмитента — отдельное действие, а не часть создания
 * записи. Причина в том, что оно может не получиться или зависнуть:
 * создавать человека в нашей базе и у эмитента одним движением значит
 * получить состояние, в котором непонятно, где он есть, а где нет.
 */

import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import { writeAudit } from '../audit'
import { markDone, markFailed, markSent, reserveIntent } from '../db/intents'
import type { OxenClient } from '../oxen'
import { LIVE_STATUSES } from './cards'
import { requireRight, type ActingOperator } from './rights'

export class UserError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'UserError'
    this.code = code
  }
}

/**
 * Причина заморозки, которую ставит блокировка учётной записи.
 *
 * Отдельная от `BY_OPERATOR` нарочно: разблокировка размораживает
 * только то, что заморозила сама блокировка. Ручную заморозку
 * оператора она снимать не должна — её ставили по другому поводу.
 */
export const FREEZE_BY_BLOCK = 'BY_BLOCK'

/**
 * Завести пользователя.
 *
 * Поля ровно три: компания, имя, почта. Телефон, дату рождения и адрес
 * оператор не вводит — их соберёт эмитент при проверке, а набранное
 * оператором со слов придётся потом исправлять в двух местах.
 *
 * Почта обязательна: на неё эмитент шлёт подтверждение оплаты.
 */
export async function createUser(
  prisma: PrismaClient,
  operator: ActingOperator,
  input: { companyId: string; fullName: string; email: string },
): Promise<{ userId: string }> {
  requireRight(operator, 'MANAGE_USERS')

  const fullName = input.fullName.trim()
  const email = input.email.trim().toLowerCase()
  if (fullName === '') throw new UserError('NO_NAME', 'Имя обязательно')
  if (!email.includes('@')) throw new UserError('BAD_EMAIL', 'Почта обязательна и должна быть почтой')

  const company = await prisma.company.findUnique({ where: { id: input.companyId } })
  if (!company) throw new UserError('COMPANY_NOT_FOUND', `Компании ${input.companyId} нет`)

  const user = await prisma.user.create({
    data: { companyId: company.id, fullName, email },
  })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'USER_CREATED',
    targetType: 'USER',
    targetId: user.id,
    targetName: fullName,
    companyId: company.id,
    after: { fullName, email, companyId: company.id },
  })

  return { userId: user.id }
}

/**
 * Завести пользователя у эмитента как картхолдера.
 *
 * Создающий вызов: повтор создаёт **второго** картхолдера. Поэтому
 * намерение с идемпотентным ключом пишется в базу до отправки
 * запроса, а не после (CLAUDE.md, правило 8).
 *
 * Статус отображается честно: «на проверке», а не «готово». Одобрение
 * приходит событием, иногда через сутки.
 */
export async function createCardholder(
  prisma: PrismaClient,
  oxen: OxenClient,
  operator: ActingOperator,
  userId: string,
): Promise<{ oxenCardholderId: string; status: string; approved: boolean }> {
  requireRight(operator, 'MANAGE_USERS')

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { company: true } })
  if (!user) throw new UserError('USER_NOT_FOUND', `Пользователя ${userId} нет`)
  if (user.status === 'BLOCKED') {
    throw new UserError('USER_BLOCKED', 'Заблокированного пользователя у эмитента не заводят')
  }
  if (!user.email) throw new UserError('NO_EMAIL', 'Без почты эмитент картхолдера не заведёт')

  if (user.oxenCardholderId) {
    // Уже заведён — перечитываем, а не создаём второго.
    const existing = await oxen.getCardholder(user.oxenCardholderId)
    await prisma.user.update({
      where: { id: user.id },
      data: { oxenStatus: existing.status },
    })
    return { oxenCardholderId: existing.id, status: existing.status, approved: existing.approved }
  }

  const intent = await reserveIntent(prisma, {
    service: 'OXEN',
    operation: 'CREATE_CARDHOLDER',
    subjectType: 'USER',
    subjectId: user.id,
  })

  if (intent.completedResultId) {
    const existing = await oxen.getCardholder(intent.completedResultId)
    await prisma.user.update({
      where: { id: user.id },
      data: { oxenCardholderId: existing.id, oxenStatus: existing.status },
    })
    return { oxenCardholderId: existing.id, status: existing.status, approved: existing.approved }
  }

  await markSent(prisma, intent.key)
  try {
    const created = await oxen.createCardholder(
      user.company.oxenClientId,
      { fullName: user.fullName, email: user.email },
      { key: intent.key },
    )
    await markDone(prisma, intent.key, created.id)
    await prisma.user.update({
      where: { id: user.id },
      data: { oxenCardholderId: created.id, oxenStatus: created.status },
    })
    await writeAudit(prisma, {
      operatorId: operator.id,
      action: 'CARDHOLDER_CREATED',
      targetType: 'USER',
      targetId: user.id,
      targetName: user.fullName,
      companyId: user.companyId,
      after: { oxenCardholderId: created.id, status: created.status },
    })
    return { oxenCardholderId: created.id, status: created.status, approved: created.approved }
  } catch (error) {
    await markFailed(prisma, intent.key, describe(error))
    throw error
  }
}

/** Перечитать статус картхолдера у эмитента. Расхождение показывается
 *  явно, а не прячется (docs/flows-admin.md, «Сквозные правила»). */
export async function refreshCardholder(
  prisma: PrismaClient,
  oxen: OxenClient,
  userId: string,
): Promise<{ status: string | null }> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new UserError('USER_NOT_FOUND', `Пользователя ${userId} нет`)
  if (!user.oxenCardholderId) return { status: null }

  const read = await oxen.getCardholder(user.oxenCardholderId)
  await prisma.user.update({ where: { id: user.id }, data: { oxenStatus: read.status } })
  return { status: read.status }
}

/**
 * Заблокировать пользователя.
 *
 * Вход закрыт, **все карты заморожены у эмитента**, не только у нас:
 * заморозка в своей базе оставила бы карту рабочей. Баланс не
 * трогается — деньги остаются на счету, пока оператор не выведет их
 * отдельным действием.
 *
 * Причина обязательна: она попадает в аудит и видна при разблокировке.
 */
export async function blockUser(
  prisma: PrismaClient,
  oxen: OxenClient,
  operator: ActingOperator,
  input: { userId: string; reason: string },
): Promise<{ frozenCards: number }> {
  requireRight(operator, 'MANAGE_USERS')
  if (input.reason.trim() === '') {
    throw new UserError('NO_REASON', 'Блокировка требует причины')
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId }, include: { cards: true } })
  if (!user) throw new UserError('USER_NOT_FOUND', `Пользователя ${input.userId} нет`)
  if (user.status === 'BLOCKED') return { frozenCards: 0 }

  // Сначала эмитент, потом своя база. Обратный порядок на сбое
  // оставил бы карту рабочей, а у нас — помеченной замороженной.
  const toFreeze = user.cards.filter((card) => card.status === 'ACTIVE')
  for (const card of toFreeze) {
    await oxen.freezeCard(card.oxenCardId)
    await prisma.card.update({
      where: { id: card.id },
      data: { status: 'FROZEN', freezeReason: FREEZE_BY_BLOCK },
    })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { status: 'BLOCKED', blockedAt: new Date(), blockReason: input.reason },
  })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'USER_BLOCKED',
    targetType: 'USER',
    targetId: user.id,
    targetName: user.fullName,
    companyId: user.companyId,
    reason: input.reason,
    before: { status: 'ACTIVE' },
    after: { status: 'BLOCKED', frozenCards: toFreeze.length },
  })

  return { frozenCards: toFreeze.length }
}

/**
 * Разблокировать.
 *
 * Размораживаются **только** карты, замороженные блокировкой. Ручная
 * заморозка оператора или пользователя сохраняется, а карту,
 * замороженную из-за минуса, размораживать нельзя вовсе, пока минус
 * не закрыт.
 */
export async function unblockUser(
  prisma: PrismaClient,
  oxen: OxenClient,
  operator: ActingOperator,
  userId: string,
): Promise<{ unfrozenCards: number }> {
  requireRight(operator, 'MANAGE_USERS')

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { cards: true } })
  if (!user) throw new UserError('USER_NOT_FOUND', `Пользователя ${userId} нет`)
  if (user.status !== 'BLOCKED') return { unfrozenCards: 0 }

  const toUnfreeze = user.cards.filter(
    (card) => card.status === 'FROZEN' && card.freezeReason === FREEZE_BY_BLOCK,
  )
  for (const card of toUnfreeze) {
    await oxen.unfreezeCard(card.oxenCardId)
    await prisma.card.update({
      where: { id: card.id },
      data: { status: 'ACTIVE', freezeReason: null },
    })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { status: 'ACTIVE', blockedAt: null, blockReason: null },
  })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'USER_UNBLOCKED',
    targetType: 'USER',
    targetId: user.id,
    targetName: user.fullName,
    companyId: user.companyId,
    before: { status: 'BLOCKED', reason: user.blockReason },
    after: { status: 'ACTIVE', unfrozenCards: toUnfreeze.length },
  })

  return { unfrozenCards: toUnfreeze.length }
}

/**
 * Индивидуальные ставки комиссий.
 *
 * Индивидуальная ставка **заменяет** глобальную, а не складывается
 * с ней. Ноль — настоящая ставка «комиссии нет», а не «не задано»:
 * «не задано» выражается пустым значением.
 */
export async function setIndividualFees(
  prisma: PrismaClient,
  operator: ActingOperator,
  input: {
    userId: string
    depositFeeBps: number | null
    withdrawalFeeBps: number | null
    reason?: string
  },
): Promise<void> {
  requireRight(operator, 'MANAGE_SETTINGS')
  for (const value of [input.depositFeeBps, input.withdrawalFeeBps]) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      throw new UserError('BAD_RATE', 'Ставка задаётся целым неотрицательным числом')
    }
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } })
  if (!user) throw new UserError('USER_NOT_FOUND', `Пользователя ${input.userId} нет`)

  await prisma.user.update({
    where: { id: user.id },
    data: { depositFeeBps: input.depositFeeBps, withdrawalFeeBps: input.withdrawalFeeBps },
  })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'FEE_OVERRIDDEN',
    targetType: 'USER',
    targetId: user.id,
    targetName: user.fullName,
    companyId: user.companyId,
    reason: input.reason,
    before: { depositFeeBps: user.depositFeeBps, withdrawalFeeBps: user.withdrawalFeeBps },
    after: { depositFeeBps: input.depositFeeBps, withdrawalFeeBps: input.withdrawalFeeBps },
  })
}

/**
 * Сбросить второй фактор и код восстановления.
 *
 * Нужно, когда человек потерял телефон. Сбрасывается и фактор, и код
 * восстановления: оставить код означало бы оставить способ войти,
 * которым мог завладеть кто угодно вместе с тем же телефоном.
 */
export async function resetSecondFactor(
  prisma: PrismaClient,
  operator: ActingOperator,
  userId: string,
): Promise<void> {
  requireRight(operator, 'MANAGE_USERS')

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new UserError('USER_NOT_FOUND', `Пользователя ${userId} нет`)

  await prisma.user.update({
    where: { id: user.id },
    data: { secondFactorHash: null, recoveryCodeHash: null, recoveryQuarantineUntil: null },
  })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'SECOND_FACTOR_RESET',
    targetType: 'USER',
    targetId: user.id,
    targetName: user.fullName,
    companyId: user.companyId,
  })
}

/* --------------------------------------------------------------------------
   Чтение для карточки пользователя
   -------------------------------------------------------------------------- */

/**
 * Сводка по деньгам пользователя.
 *
 * Считается **из леджера**, по типам проводок, а не из отдельно
 * хранимых счётчиков: счётчик однажды разойдётся с проводками, и
 * узнаем мы об этом от человека, который не сойдётся в сумме.
 */
export async function moneySummary(
  db: PrismaClient | Prisma.TransactionClient,
  userId: string,
): Promise<{ deposited: bigint; spent: bigint; fees: bigint; withdrawn: bigint; refunded: bigint }> {
  const entries = await db.ledgerEntry.findMany({
    where: { account: `USER:${userId}` },
    select: { amountMinor: true, transaction: { select: { type: true } } },
  })
  const fees = await db.ledgerEntry.findMany({
    where: { account: 'FEE_INCOME', transaction: { userId } },
    select: { amountMinor: true },
  })

  const sum = (type: string, sign: 1n | -1n) =>
    entries
      .filter((entry) => entry.transaction.type === type)
      .reduce<bigint>((total, entry) => total + entry.amountMinor * sign, 0n)

  return {
    // Зачисления приходят на счёт пользователя со знаком плюс,
    // траты и выводы — со знаком минус. Знак разворачивается здесь,
    // чтобы наружу уходили величины, а не направления.
    deposited: sum('DEPOSIT', 1n),
    spent: sum('SPEND', -1n),
    withdrawn: sum('WITHDRAWAL', -1n),
    refunded: sum('REFUND', 1n),
    fees: fees.reduce<bigint>((total, entry) => total + entry.amountMinor, 0n),
  }
}

/** Живые карты пользователя. Отменённые отдельно: они не занимают
 *  слот, но нужны для разбора истории. */
export async function liveCards(prisma: PrismaClient, userId: string) {
  return prisma.card.findMany({
    where: { userId, status: { in: [...LIVE_STATUSES] } },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })
}

/** Идентификатор для намерения на выпуск карты. Генерируется заранее,
 *  до вызова наружу: иначе повтор не найдёт, к чему привязаться. */
export function newCardId(): string {
  return randomUUID()
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

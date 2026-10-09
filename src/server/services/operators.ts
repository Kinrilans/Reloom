/**
 * Операторы админки.
 *
 * Два правила, которые нельзя ослабить:
 *
 *   1. **Права выдаёт только тот, у кого есть `GRANT_RIGHTS`.**
 *      Оператор с `MANAGE_USERS` не может выдать себе право на деньги.
 *   2. **Удаления нет** — только отключение, и оно обратимо. Записи
 *      аудита ссылаются на оператора, и удалённый оператор превратил
 *      бы историю в набор ссылок в никуда.
 *
 * Второй фактор обязателен, и настраивает его сам оператор при первом
 * входе: секрет не передаётся из рук в руки, иначе он известен двоим.
 */

import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@/generated/prisma/client'
import { writeAudit } from '../audit'
import { hashPassword, verifyPassword } from '../auth/password'
import { revokeAllSessions } from '../auth/session'
import { RIGHTS, requireRight, type ActingOperator, type Right } from './rights'

export class OperatorError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'OperatorError'
    this.code = code
  }
}

function assertKnownRights(rights: string[]): asserts rights is Right[] {
  for (const right of rights) {
    if (!(RIGHTS as readonly string[]).includes(right)) {
      throw new OperatorError('UNKNOWN_RIGHT', `Неизвестное право: ${right}`)
    }
  }
}

/**
 * Завести оператора.
 *
 * Пароль выдаётся одноразовым и показывается ровно один раз — он нужен
 * для первого входа, после которого оператор настроит второй фактор.
 * В базе лежит только хэш.
 */
export async function createOperator(
  prisma: PrismaClient,
  operator: ActingOperator,
  input: { email: string; fullName: string; rights: string[]; locale?: string },
): Promise<{ operatorId: string; oneTimePassword: string }> {
  requireRight(operator, 'GRANT_RIGHTS')
  assertKnownRights(input.rights)

  const email = input.email.trim().toLowerCase()
  const fullName = input.fullName.trim()
  if (!email.includes('@')) throw new OperatorError('BAD_EMAIL', 'Нужна почта')
  if (fullName === '') throw new OperatorError('NO_NAME', 'Имя обязательно')

  const taken = await prisma.operator.findUnique({ where: { email } })
  if (taken) throw new OperatorError('EMAIL_TAKEN', 'Оператор с такой почтой уже есть')

  // 24 случайных байта в base64url — длиннее любого требования
  // к длине и не выговаривается вслух, что здесь плюс: пароль
  // одноразовый и передаётся текстом.
  const oneTimePassword = randomBytes(24).toString('base64url')
  const created = await prisma.operator.create({
    data: {
      email,
      fullName,
      passwordHash: await hashPassword(oneTimePassword),
      rights: input.rights,
      locale: input.locale ?? 'ru',
    },
  })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'OPERATOR_CREATED',
    targetType: 'OPERATOR',
    targetId: created.id,
    targetName: fullName,
    after: { email, rights: input.rights },
  })

  return { operatorId: created.id, oneTimePassword }
}

/**
 * Изменить права.
 *
 * Права главного администратора не меняются: он единственный, кто
 * заведомо может вернуть доступ остальным, и отобрать это у него
 * означает запереть систему.
 */
export async function setRights(
  prisma: PrismaClient,
  operator: ActingOperator,
  input: { operatorId: string; rights: string[] },
): Promise<void> {
  requireRight(operator, 'GRANT_RIGHTS')
  assertKnownRights(input.rights)

  const target = await prisma.operator.findUnique({ where: { id: input.operatorId } })
  if (!target) throw new OperatorError('NOT_FOUND', `Оператора ${input.operatorId} нет`)
  if (target.isSuperAdmin) {
    throw new OperatorError('SUPER_ADMIN', 'У главного администратора права все и всегда')
  }

  await prisma.operator.update({ where: { id: target.id }, data: { rights: input.rights } })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'RIGHTS_CHANGED',
    targetType: 'OPERATOR',
    targetId: target.id,
    targetName: target.fullName,
    before: { rights: target.rights },
    after: { rights: input.rights },
  })
}

/**
 * Отключить оператора.
 *
 * Вместе с отключением **отзываются его сессии**. Без этого
 * «отключён» означало бы «не сможет войти заново», а открытая
 * вкладка продолжала бы работать.
 */
export async function setOperatorActive(
  prisma: PrismaClient,
  operator: ActingOperator,
  input: { operatorId: string; isActive: boolean },
): Promise<void> {
  requireRight(operator, 'GRANT_RIGHTS')

  const target = await prisma.operator.findUnique({ where: { id: input.operatorId } })
  if (!target) throw new OperatorError('NOT_FOUND', `Оператора ${input.operatorId} нет`)
  if (target.isSuperAdmin && !input.isActive) {
    throw new OperatorError('SUPER_ADMIN', 'Главного администратора отключить нельзя')
  }
  if (target.id === operator.id && !input.isActive) {
    throw new OperatorError('SELF', 'Себя отключить нельзя')
  }

  await prisma.operator.update({ where: { id: target.id }, data: { isActive: input.isActive } })
  if (!input.isActive) await revokeAllSessions(prisma, target.id)

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: input.isActive ? 'OPERATOR_ENABLED' : 'OPERATOR_DISABLED',
    targetType: 'OPERATOR',
    targetId: target.id,
    targetName: target.fullName,
    before: { isActive: target.isActive },
    after: { isActive: input.isActive },
  })
}

/**
 * Сбросить второй фактор оператору.
 *
 * Нужно, когда он потерял телефон. Секрет стирается, и при следующем
 * входе оператор настраивает фактор заново. Сессии отзываются: иначе
 * открытая вкладка осталась бы доступом без второго фактора.
 *
 * **Себе — нельзя**, причина в `SELF_IN_PROFILE` ниже.
 */
export async function resetOperatorTotp(
  prisma: PrismaClient,
  operator: ActingOperator,
  operatorId: string,
): Promise<void> {
  requireRight(operator, 'GRANT_RIGHTS')
  if (operatorId === operator.id) throw selfError()

  const target = await prisma.operator.findUnique({ where: { id: operatorId } })
  if (!target) throw new OperatorError('NOT_FOUND', `Оператора ${operatorId} нет`)

  await prisma.operator.update({
    where: { id: target.id },
    data: { totpSecret: null, totpConfirmedAt: null },
  })
  await revokeAllSessions(prisma, target.id)

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'OPERATOR_TOTP_RESET',
    targetType: 'OPERATOR',
    targetId: target.id,
    targetName: target.fullName,
  })
}

/**
 * Ошибка попытки распорядиться своим же доступом из раздела
 * «Операторы».
 *
 * Выдача нового пароля и сброс второго фактора — действия «для
 * другого»: они отзывают сессии цели и заменяют её доступ случайным
 * значением, которое надо передать живому человеку. Применённые
 * к себе, они выбрасывают оператора из админки той же секундой —
 * и выбрасывают **до того**, как он успеет прочитать выданный пароль.
 * Старый уже не действует, новый он не видел: доступ потерян
 * полностью, и вернуть его может только другой оператор или скрипт
 * первого запуска.
 *
 * Поэтому запрет стоит здесь, на сервере, а не только в виде спрятанной
 * кнопки: смена своего пароля живёт в профиле, где спрашивают текущий,
 * новый задаёт сам человек, и своя сессия остаётся живой. Там же —
 * перепривязка второго фактора.
 */
function selfError(): OperatorError {
  return new OperatorError(
    'SELF_IN_PROFILE',
    'Свой пароль и свой второй фактор меняются в профиле: здесь они выдаются ' +
      'случайными и отзывают сессию, то есть вы потеряете доступ, не увидев нового пароля',
  )
}

/** Выдать оператору новый одноразовый пароль. Старые сессии
 *  отзываются: смена пароля должна выгонять того, кто вошёл по
 *  прежнему. Себе — нельзя, см. `selfError`. */
export async function resetOperatorPassword(
  prisma: PrismaClient,
  operator: ActingOperator,
  operatorId: string,
): Promise<{ oneTimePassword: string }> {
  requireRight(operator, 'GRANT_RIGHTS')
  if (operatorId === operator.id) throw selfError()

  const target = await prisma.operator.findUnique({ where: { id: operatorId } })
  if (!target) throw new OperatorError('NOT_FOUND', `Оператора ${operatorId} нет`)

  const oneTimePassword = randomBytes(24).toString('base64url')
  await prisma.operator.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(oneTimePassword) },
  })
  await revokeAllSessions(prisma, target.id)

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'OPERATOR_PASSWORD_RESET',
    targetType: 'OPERATOR',
    targetId: target.id,
    targetName: target.fullName,
  })

  return { oneTimePassword }
}

/**
 * Свой пароль оператор меняет сам, со вводом текущего.
 *
 * Сессии при этом **не** отзываются все: человек меняет пароль из
 * своей же вкладки, и выгонять его из неё незачем. Отзываются
 * остальные — на случай, если пароль меняют как раз потому, что он
 * куда-то утёк.
 */
export async function changeOwnPassword(
  prisma: PrismaClient,
  operator: ActingOperator,
  input: { currentPassword: string; nextPassword: string; keepSessionId?: string },
): Promise<void> {
  const me = await prisma.operator.findUnique({ where: { id: operator.id } })
  if (!me) throw new OperatorError('NOT_FOUND', 'Оператора нет')
  if (!(await verifyPassword(input.currentPassword, me.passwordHash))) {
    throw new OperatorError('BAD_PASSWORD', 'Текущий пароль не сошёлся')
  }

  await prisma.operator.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(input.nextPassword) },
  })

  await prisma.operatorSession.updateMany({
    where: {
      operatorId: me.id,
      revokedAt: null,
      ...(input.keepSessionId ? { id: { not: input.keepSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  })

  await writeAudit(prisma, {
    operatorId: me.id,
    action: 'OPERATOR_PASSWORD_CHANGED',
    targetType: 'OPERATOR',
    targetId: me.id,
    targetName: me.fullName,
  })
}

/** Свой язык интерфейса. */
export async function setOwnLocale(
  prisma: PrismaClient,
  operator: ActingOperator,
  locale: string,
): Promise<void> {
  if (locale !== 'ru' && locale !== 'en') {
    throw new OperatorError('BAD_LOCALE', `Неизвестный язык: ${locale}`)
  }
  await prisma.operator.update({ where: { id: operator.id }, data: { locale } })
}

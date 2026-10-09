/**
 * Сессии операторов.
 *
 * Сессия хранится в базе, а не в подписанном cookie без состояния.
 * Разница в одном, и она решающая: **хранимую сессию можно отозвать**.
 * Отключили оператора или сбросили ему второй фактор — доступ пропадает
 * в ту же секунду, а не когда истечёт срок подписи.
 *
 * В cookie уходит случайный токен, в базе лежит его хэш. Дамп базы
 * войти не даёт.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { PrismaClient } from '@/generated/prisma/client'

export const COOKIE_NAME = 'reloom_admin_session'

/**
 * Срок жизни сессии — рабочий день.
 *
 * Дольше держать нельзя: админка двигает чужие деньги, а оставленный
 * открытым ноутбук — самый обычный способ потерять доступ. Короче
 * неудобно настолько, что оператор начнёт искать способ обойти.
 */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

export interface SessionOperator {
  id: string
  email: string
  fullName: string
  rights: string[]
  isSuperAdmin: boolean
  isActive: boolean
  locale: string
  sessionId: string
}

export interface IssuedSession {
  token: string
  expiresAt: Date
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(
  prisma: PrismaClient,
  operatorId: string,
  now: Date = new Date(),
): Promise<IssuedSession> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
  await prisma.operatorSession.create({
    data: { operatorId, tokenHash: hashToken(token), expiresAt, lastSeenAt: now, createdAt: now },
  })
  return { token, expiresAt }
}

/**
 * Кто пришёл с этим токеном.
 *
 * Отдаёт `null` на всём, что хоть чем-то не в порядке: нет сессии,
 * отозвана, просрочена, оператор отключён. Различать эти случаи
 * в ответе незачем — на экране входа все они выглядят одинаково.
 */
export async function resolveSession(
  prisma: PrismaClient,
  token: string | undefined,
  now: Date = new Date(),
): Promise<SessionOperator | null> {
  if (!token) return null

  const session = await prisma.operatorSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { operator: true },
  })
  if (!session) return null
  if (session.revokedAt !== null) return null
  if (session.expiresAt <= now) return null
  if (!session.operator.isActive) return null

  // Отметка «был здесь» нужна не для безопасности, а для разбора:
  // по ней видно, кто из операторов работает, а чья сессия просто
  // висит открытой. Пишется не на каждый запрос — иначе каждое
  // открытие списка превращается в запись в базу.
  if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.operatorSession.update({ where: { id: session.id }, data: { lastSeenAt: now } })
  }

  return {
    id: session.operator.id,
    email: session.operator.email,
    fullName: session.operator.fullName,
    rights: session.operator.rights,
    isSuperAdmin: session.operator.isSuperAdmin,
    isActive: session.operator.isActive,
    locale: session.operator.locale,
    sessionId: session.id,
  }
}

export async function revokeSession(
  prisma: PrismaClient,
  token: string | undefined,
  now: Date = new Date(),
): Promise<void> {
  if (!token) return
  await prisma.operatorSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: now },
  })
}

/**
 * Отозвать все сессии оператора.
 *
 * Вызывается при отключении оператора, сбросе его второго фактора и
 * смене пароля. Без этого «отключён» означает «не сможет войти
 * заново», а открытая вкладка продолжает работать.
 */
export async function revokeAllSessions(
  prisma: PrismaClient,
  operatorId: string,
  now: Date = new Date(),
): Promise<number> {
  const result = await prisma.operatorSession.updateMany({
    where: { operatorId, revokedAt: null },
    data: { revokedAt: now },
  })
  return result.count
}

/** Сравнение токенов постоянного времени — на случай, если токен
 *  понадобится сверять вне поиска по хэшу. */
export function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * Доступ оператора к админке со стороны Next.
 *
 * Здесь и только здесь читается cookie. Сами правила — в соседних
 * файлах: проверка пароля, второй фактор, сессии. Разделение нужно
 * затем, чтобы правила можно было проверить тестом, не поднимая
 * фреймворк.
 *
 * **Право проверяется на сервере, в каждом действии.** Интерфейс
 * скрывает недоступные кнопки, чтобы оператор не тратил время, но
 * спрятанная кнопка — не защита: запрос уходит и мимо неё
 * (docs/flows-admin.md).
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '../db/client'
import { has, requireRight, RIGHTS, type ActingOperator, type Right } from '../services/rights'
import { COOKIE_NAME, resolveSession, revokeSession, type SessionOperator } from './session'

export { COOKIE_NAME, SESSION_TTL_MS } from './session'
export type { SessionOperator } from './session'

/** Кто пришёл. `null` — никто: гость или просроченная сессия. */
export async function currentOperator(): Promise<SessionOperator | null> {
  const jar = await cookies()
  return resolveSession(prisma, jar.get(COOKIE_NAME)?.value)
}

/**
 * Оператор или уход на вход.
 *
 * Вызывается первой строкой каждого защищённого экрана. Проверять
 * доступ в одной только раскладке нельзя: раскладка в App Router не
 * перерисовывается при переходах между своими страницами.
 */
export async function requireOperator(): Promise<SessionOperator> {
  const operator = await currentOperator()
  if (!operator) redirect('/admin/login')
  return operator
}

/** Оператор с правом. Без права — ошибка, а не тихий «ничего не
 *  произошло»: отказ должен отличаться от сломанной кнопки. */
export async function requireOperatorWith(right: Right): Promise<SessionOperator> {
  const operator = await requireOperator()
  requireRight(acting(operator), right)
  return operator
}

/** Привести сессию к виду, который понимает доменный слой. */
export function acting(operator: SessionOperator): ActingOperator {
  return {
    id: operator.id,
    rights: operator.rights,
    isSuperAdmin: operator.isSuperAdmin,
    isActive: operator.isActive,
  }
}

export function can(operator: SessionOperator, right: Right): boolean {
  return has(acting(operator), right)
}

/** Права для интерфейса: у главного администратора они все. */
export function effectiveRights(operator: SessionOperator): Right[] {
  return RIGHTS.filter((right) => can(operator, right))
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies()
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    // В разработке приложение открывается по http, и cookie с `secure`
    // браузер не сохранит — локальный вход сломался бы.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function clearSession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  await revokeSession(prisma, token)
  jar.delete(COOKIE_NAME)
}

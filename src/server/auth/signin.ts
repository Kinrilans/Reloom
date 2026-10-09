/**
 * Вход оператора: пароль плюс второй фактор.
 *
 * Второй фактор здесь не галочка «для надёжности». Админка двигает
 * чужие деньги, а пароль утекает вместе с ноутбуком, записной книжкой
 * и повторным использованием на чужом сайте. Поэтому сессия
 * создаётся **только** после подтверждённого кода.
 *
 * Отсюда и порядок первого входа: у нового оператора второго фактора
 * ещё нет, и он настраивает его на том же экране, где входит. Пустить
 * его внутрь без фактора «пока настроит» нельзя — «пока» длится
 * месяцами.
 *
 * Причина неудачи наружу не уточняется: «почта не найдена» и «пароль
 * не тот» вместе дают список действующих адресов.
 */

import type { PrismaClient } from '@/generated/prisma/client'
import { writeAudit } from '../audit'
import { verifyPassword } from './password'
import { createSession, type IssuedSession } from './session'
import { noteAttempt, noteSuccess } from './throttle'
import { generateTotpSecret, totpUri, verifyTotp } from './totp'

export type SignInFailure =
  /** Почта или пароль не те. Какое именно — не говорим. */
  | 'BAD_CREDENTIALS'
  /** Код второго фактора не сошёлся. */
  | 'BAD_CODE'
  /** Слишком много попыток. */
  | 'THROTTLED'

export type PasswordStepResult =
  | { ok: true; needsSetup: false }
  /** Второго фактора ещё нет: показываем секрет и ждём код из
   *  приложения. Секрет отдаётся только после верного пароля. */
  | { ok: true; needsSetup: true; secret: string; uri: string }
  | { ok: false; reason: SignInFailure; retryAfterSeconds?: number }

/**
 * Первый шаг: проверка пароля.
 *
 * Сессию не создаёт и доступа не даёт. Единственное, что он может
 * выдать, — секрет для настройки второго фактора, и только тогда,
 * когда пароль верен.
 */
export async function checkPasswordStep(
  prisma: PrismaClient,
  input: { email: string; password: string },
): Promise<PasswordStepResult> {
  const email = normalizeEmail(input.email)
  const verdict = noteAttempt(email)
  if (!verdict.allowed) {
    return { ok: false, reason: 'THROTTLED', retryAfterSeconds: verdict.retryAfterSeconds }
  }

  const operator = await prisma.operator.findUnique({ where: { email } })
  if (!operator || !operator.isActive) return { ok: false, reason: 'BAD_CREDENTIALS' }
  if (!(await verifyPassword(input.password, operator.passwordHash))) {
    return { ok: false, reason: 'BAD_CREDENTIALS' }
  }

  if (operator.totpSecret !== null && operator.totpConfirmedAt !== null) {
    return { ok: true, needsSetup: false }
  }

  // Секрет не подтверждён — настройка ещё не доведена до конца.
  // Выдаём новый: недоподтверждённый мог остаться с прошлой попытки,
  // когда оператор закрыл вкладку, не отсканировав код.
  const secret = generateTotpSecret()
  await prisma.operator.update({
    where: { id: operator.id },
    data: { totpSecret: secret, totpConfirmedAt: null },
  })
  return { ok: true, needsSetup: true, secret, uri: totpUri(secret, operator.email) }
}

export type SignInResult =
  | { ok: true; session: IssuedSession; operatorId: string }
  | { ok: false; reason: SignInFailure; retryAfterSeconds?: number }

/**
 * Второй шаг: пароль и код вместе.
 *
 * Пароль проверяется **ещё раз**, а не берётся на доверии от первого
 * шага: иначе достаточно было бы послать второй запрос мимо первого.
 */
export async function signIn(
  prisma: PrismaClient,
  input: { email: string; password: string; code: string },
  now: Date = new Date(),
): Promise<SignInResult> {
  const email = normalizeEmail(input.email)
  const verdict = noteAttempt(email, now.getTime())
  if (!verdict.allowed) {
    return { ok: false, reason: 'THROTTLED', retryAfterSeconds: verdict.retryAfterSeconds }
  }

  const operator = await prisma.operator.findUnique({ where: { email } })
  if (!operator || !operator.isActive) return { ok: false, reason: 'BAD_CREDENTIALS' }
  if (!(await verifyPassword(input.password, operator.passwordHash))) {
    return { ok: false, reason: 'BAD_CREDENTIALS' }
  }
  if (operator.totpSecret === null) return { ok: false, reason: 'BAD_CODE' }
  if (!verifyTotp(operator.totpSecret, input.code, now)) return { ok: false, reason: 'BAD_CODE' }

  // Код сошёлся — значит приложение настроено, и секрет можно считать
  // подтверждённым. Делается это ровно здесь, один раз.
  if (operator.totpConfirmedAt === null) {
    await prisma.operator.update({
      where: { id: operator.id },
      data: { totpConfirmedAt: now },
    })
  }

  noteSuccess(email)
  const session = await createSession(prisma, operator.id, now)

  // Вход — в журнал аудита: по нему потом отвечают на вопрос «кто
  // в это время работал».
  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'SIGNED_IN',
    targetType: 'OPERATOR',
    targetId: operator.id,
    targetName: operator.fullName,
  })

  return { ok: true, session, operatorId: operator.id }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

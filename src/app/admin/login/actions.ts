'use server'

/**
 * Вход оператора.
 *
 * Два шага: пароль, потом код из приложения-аутентификатора. Сессия
 * создаётся **только после кода** — пароль сам по себе доступа не
 * даёт (`src/server/auth/signin.ts`).
 *
 * Причина неудачи наружу не уточняется: «почта не найдена» и «пароль
 * не тот» вместе дают список действующих адресов.
 */

import { setSessionCookie } from '@/server/auth'
import { checkPasswordStep, signIn } from '@/server/auth/signin'
import { prisma } from '@/server/db/client'

export interface PasswordStepView {
  ok: boolean
  /** Второго фактора ещё нет: показываем секрет и ждём код. */
  needsSetup: boolean
  secret?: string
  uri?: string
  error?: 'BAD_CREDENTIALS' | 'BAD_CODE' | 'THROTTLED'
  retryAfterSeconds?: number
}

export async function passwordStepAction(
  email: string,
  password: string,
): Promise<PasswordStepView> {
  const result = await checkPasswordStep(prisma, { email, password })
  if (!result.ok) {
    return {
      ok: false,
      needsSetup: false,
      error: result.reason,
      ...(result.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: result.retryAfterSeconds }),
    }
  }
  if (result.needsSetup) {
    return { ok: true, needsSetup: true, secret: result.secret, uri: result.uri }
  }
  return { ok: true, needsSetup: false }
}

export interface SignInView {
  ok: boolean
  error?: 'BAD_CREDENTIALS' | 'BAD_CODE' | 'THROTTLED'
  retryAfterSeconds?: number
}

export async function signInAction(
  email: string,
  password: string,
  code: string,
): Promise<SignInView> {
  const result = await signIn(prisma, { email, password, code })
  if (!result.ok) {
    return {
      ok: false,
      error: result.reason,
      ...(result.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: result.retryAfterSeconds }),
    }
  }
  await setSessionCookie(result.session.token, result.session.expiresAt)
  return { ok: true }
}

'use server'

/**
 * Свой профиль оператора: язык, второй фактор, пароль.
 *
 * Всё здесь — про себя, и ничего нельзя сделать за другого: чужой
 * второй фактор сбрасывают в разделе «Операторы», с правом
 * `GRANT_RIGHTS`.
 */

import { currentOperator, acting, requireOperator } from '@/server/auth'
import { generateTotpSecret, totpUri, verifyTotp } from '@/server/auth/totp'
import { writeAudit } from '@/server/audit'
import { prisma } from '@/server/db/client'
import { changeOwnPassword, setOwnLocale } from '@/server/services/operators'

type Result = { ok: true } | { ok: false; error: string }

export async function setLocaleAction(locale: string): Promise<Result> {
  const operator = await requireOperator()
  try {
    await setOwnLocale(prisma, acting(operator), locale)
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Перепривязать второй фактор к новому приложению.
 *
 * Новый секрет выдаётся сразу, и **старый код перестаёт работать
 * в этот же момент**: держать два действующих секрета значит иметь два
 * входа, один из которых потерян вместе с телефоном — а именно от
 * этого перепривязка и спасает.
 *
 * Пока новый код не подтверждён, следующий вход пройдёт через
 * настройку: экран входа сам выдаст секрет, если подтверждения нет.
 */
export async function reconnectTotpAction(): Promise<
  { ok: true; secret: string; uri: string } | { ok: false; error: string }
> {
  const operator = await requireOperator()
  const secret = generateTotpSecret()
  await prisma.operator.update({
    where: { id: operator.id },
    data: { totpSecret: secret, totpConfirmedAt: null },
  })
  return { ok: true, secret, uri: totpUri(secret, operator.email) }
}

export async function confirmTotpAction(code: string): Promise<Result> {
  const operator = await requireOperator()
  const row = await prisma.operator.findUnique({ where: { id: operator.id } })
  if (!row?.totpSecret) return { ok: false, error: 'NO_SECRET' }
  if (!verifyTotp(row.totpSecret, code)) return { ok: false, error: 'BAD_CODE' }

  await prisma.operator.update({
    where: { id: operator.id },
    data: { totpConfirmedAt: new Date() },
  })
  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'OPERATOR_TOTP_CONNECTED',
    targetType: 'OPERATOR',
    targetId: operator.id,
    targetName: row.fullName,
  })
  return { ok: true }
}

/**
 * Сменить свой пароль.
 *
 * Текущий пароль спрашивается обязательно: иначе открытая вкладка
 * становится способом сменить пароль, не зная прежнего.
 *
 * Остальные сессии отзываются — пароль меняют и тогда, когда он куда-то
 * утёк, — а своя остаётся: выгонять человека из вкладки, в которой он
 * только что сменил пароль, незачем.
 */
export async function changePasswordAction(input: {
  currentPassword: string
  nextPassword: string
}): Promise<Result> {
  const operator = await currentOperator()
  if (!operator) return { ok: false, error: 'NO_SESSION' }

  try {
    await changeOwnPassword(prisma, acting(operator), {
      currentPassword: input.currentPassword,
      nextPassword: input.nextPassword,
      keepSessionId: operator.sessionId,
    })
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

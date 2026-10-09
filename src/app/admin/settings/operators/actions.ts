'use server'

/**
 * Операторы и права.
 *
 * Права выдаёт только обладатель `GRANT_RIGHTS`. Оператор
 * с `MANAGE_USERS` выдать себе право на деньги не может — заведение
 * пользователей и раздача прав разные вещи.
 *
 * Удаления нет. Записи аудита ссылаются на оператора, и удалённый
 * оператор превратил бы историю в набор ссылок в никуда. Есть
 * отключение, и оно обратимо.
 */

import { revalidatePath } from 'next/cache'
import { acting, requireOperator } from '@/server/auth'
import { prisma } from '@/server/db/client'
import {
  createOperator,
  resetOperatorPassword,
  resetOperatorTotp,
  setOperatorActive,
  setRights,
} from '@/server/services/operators'

type Result = { ok: true } | { ok: false; error: string }

/**
 * Завести оператора.
 *
 * Пароль придумывает **сервер** и показывает его один раз: пароль,
 * придуманный одним человеком для другого, оказывается известен двоим
 * и обычно попадает в переписку. Второй фактор новый оператор
 * настраивает сам при первом входе — выдать его за него нельзя.
 */
export async function createOperatorAction(input: {
  email: string
  fullName: string
  rights: string[]
}): Promise<{ ok: true; oneTimePassword: string } | { ok: false; error: string }> {
  const operator = await requireOperator()
  try {
    const result = await createOperator(prisma, acting(operator), input)
    revalidatePath('/admin/settings/operators')
    return { ok: true, oneTimePassword: result.oneTimePassword }
  } catch (error) {
    return fail(error)
  }
}

export async function setRightsAction(operatorId: string, rights: string[]): Promise<Result> {
  const operator = await requireOperator()
  try {
    await setRights(prisma, acting(operator), { operatorId, rights })
    revalidatePath('/admin/settings/operators')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function setActiveAction(operatorId: string, isActive: boolean): Promise<Result> {
  const operator = await requireOperator()
  try {
    await setOperatorActive(prisma, acting(operator), { operatorId, isActive })
    revalidatePath('/admin/settings/operators')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function resetTotpAction(operatorId: string): Promise<Result> {
  const operator = await requireOperator()
  try {
    await resetOperatorTotp(prisma, acting(operator), operatorId)
    revalidatePath('/admin/settings/operators')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function resetPasswordAction(
  operatorId: string,
): Promise<{ ok: true; oneTimePassword: string } | { ok: false; error: string }> {
  const operator = await requireOperator()
  try {
    const result = await resetOperatorPassword(prisma, acting(operator), operatorId)
    revalidatePath('/admin/settings/operators')
    return { ok: true, oneTimePassword: result.oneTimePassword }
  } catch (error) {
    return fail(error)
  }
}

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

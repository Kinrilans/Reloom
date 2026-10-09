'use server'

/**
 * Общие действия админки.
 *
 * Серверные действия — тонкий слой: разобрать ввод, проверить право,
 * позвать сервис, обновить экран. Денежной логики здесь нет и быть не
 * должно, она в `src/server/services`.
 *
 * Право проверяется **здесь, на сервере**, в каждом действии. То, что
 * кнопка спрятана, не значит ничего: запрос уходит и мимо неё.
 */

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { acting, clearSession, requireOperator } from '@/server/auth'
import { prisma } from '@/server/db/client'
import { oxen } from '@/server/deps'
import { refreshPools } from '@/server/services/pool'
import { requireRight } from '@/server/services/rights'
import { COMPANY_COOKIE } from './constants'

/** Выбранная компания. «Все компании» — сводный режим. */
export async function selectCompanyAction(companyId: string): Promise<void> {
  await requireOperator()
  const jar = await cookies()
  jar.set(COMPANY_COOKIE, companyId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    // Выбор компании — не секрет и не доступ: он живёт год, чтобы
    // оператор не выбирал её заново каждое утро.
    maxAge: 365 * 24 * 3600,
  })
}

export async function signOutAction(): Promise<void> {
  await clearSession()
  redirect('/admin/login')
}

/**
 * Перечитать пулы компаний у эмитента.
 *
 * Пул в нашей базе — зеркало. Кнопка нужна затем, чтобы оператор мог
 * обновить его, не дожидаясь фонового процесса: решение «пополнять
 * ли пул» принимается по свежему числу.
 */
export async function refreshPoolsAction(): Promise<{ updated: number; failed: number }> {
  const operator = await requireOperator()
  // Чтение пула — не изменение настроек, но и не рядовой просмотр:
  // это обращение наружу от нашего имени. Разрешаем тем, кто и так
  // отвечает за деньги.
  requireRight(acting(operator), 'APPROVE_DEPOSITS')

  const result = await refreshPools(prisma, oxen())
  revalidatePath('/admin')
  revalidatePath('/admin/system')
  revalidatePath('/admin/settings/companies')
  return { updated: result.updated, failed: result.failed.length }
}

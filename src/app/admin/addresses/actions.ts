'use server'

/**
 * Уничтожение крипто-адреса.
 *
 * Отдельное право `MANAGE_ADDRESSES`: ошибка с адресом означает
 * деньги, ушедшие в никуда, а название сети или ставку можно
 * поправить.
 *
 * Уничтоженный адрес из реестра не удаляется: поступления по нему
 * остаются в истории, а пользователь при следующем пополнении
 * заводит новый.
 */

import { revalidatePath } from 'next/cache'
import { acting, requireOperator } from '@/server/auth'
import { prisma } from '@/server/db/client'
import { burnAddress } from '@/server/services/addresses'

export async function burnAddressAction(
  addressId: string,
): Promise<{ ok: boolean; error?: string }> {
  const operator = await requireOperator()
  try {
    await burnAddress(prisma, acting(operator), { addressId, reason: 'COMPROMISED' })
    revalidatePath('/admin/addresses')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

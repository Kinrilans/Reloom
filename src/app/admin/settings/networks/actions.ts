'use server'

/**
 * Сети и монеты.
 *
 * Список пар приходит от сервиса адресов: открывать у себя сеть,
 * в которой он не выдаёт адрес, бессмысленно — пополнять по ней будет
 * нечем. Поэтому кнопка «обновить» ходит к нему, а не открывает форму
 * для ввода руками.
 */

import { revalidatePath } from 'next/cache'
import { acting, requireOperator } from '@/server/auth'
import { prisma } from '@/server/db/client'
import { wallet } from '@/server/deps'
import { setNetworkIcon, syncNetworks, updateNetwork } from '@/server/services/settings'
import { parseMinor } from '@/shared/money'

type Result = { ok: true } | { ok: false; error: string }

export async function syncNetworksAction(): Promise<
  { ok: true; added: number; updated: number } | { ok: false; error: string }
> {
  const operator = await requireOperator()
  try {
    const assets = await wallet().listAssets()
    const result = await syncNetworks(prisma, acting(operator), assets)
    revalidatePath('/admin/settings/networks')
    return { ok: true, added: result.added, updated: result.updated }
  } catch (error) {
    return fail(error)
  }
}

export async function toggleNetworkAction(
  networkId: string,
  isActive: boolean,
): Promise<Result> {
  const operator = await requireOperator()
  try {
    await updateNetwork(prisma, acting(operator), { networkId, isActive })
    revalidatePath('/admin/settings/networks')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function saveNetworkAction(input: {
  networkId: string
  minDepositOn: boolean
  minDeposit: string
  /** `data:`-строка значка или `null`, чтобы убрать. Пропуск поля
   *  оставляет значок как есть. */
  icon?: string | null
}): Promise<Result> {
  const operator = await requireOperator()

  try {
    // «Минимума нет» и «минимум ноль» — разные вещи, поэтому значение
    // сохраняется независимо от переключателя: выключенный минимум
    // не должен затирать введённое число.
    const minDepositMinor = input.minDeposit.trim() === '' ? null : parseMinor(input.minDeposit)

    await updateNetwork(prisma, acting(operator), {
      networkId: input.networkId,
      minDepositOn: input.minDepositOn,
      minDepositMinor,
    })
    if (input.icon !== undefined) {
      await setNetworkIcon(prisma, acting(operator), {
        networkId: input.networkId,
        dataUrl: input.icon,
      })
    }
    revalidatePath('/admin/settings/networks')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

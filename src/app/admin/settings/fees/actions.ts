'use server'

/**
 * Сохранение настроек комиссий и автозачисления.
 *
 * Все поля приходят строками — ровно теми, что видел оператор. Разбор
 * сумм идёт через общий хелпер `parseMinor`: он читает «1 000.00» без
 * плавающей точки, а `parseFloat('0.29') * 100` даёт
 * 28.999999999999996, и центы начинают теряться на ровном месте.
 *
 * Каждое изменение попадает в аудит снимком «было → стало», а
 * переключение автозачисления — отдельным, выделенным действием:
 * это решение о том, кто зачисляет деньги, система или человек.
 */

import { revalidatePath } from 'next/cache'
import { acting, requireOperator } from '@/server/auth'
import { prisma } from '@/server/db/client'
import { previewFor } from '@/server/admin/settings'
import { updateSettings, type SettingsPatch } from '@/server/services/settings'
import { parseMinor } from '@/shared/money'

export interface FeesForm {
  depositBps: string
  depositFixed: string
  depositMin: string
  withdrawalBps: string
  withdrawalFixed: string
  withdrawalMin: string
  minDeposit: string
  minWithdrawal: string
  autoCredit: boolean
  creditWithoutAml: boolean
  amlMaxRisk: string
  confirmations: string
}

export async function saveFeesAction(
  form: FeesForm,
): Promise<{ ok: boolean; error?: string }> {
  const operator = await requireOperator()

  let patch: SettingsPatch
  try {
    patch = {
      depositFeeBps: int(form.depositBps),
      depositFeeFixedMinor: parseMinor(form.depositFixed),
      depositFeeMinMinor: parseMinor(form.depositMin),
      withdrawalFeeBps: int(form.withdrawalBps),
      withdrawalFeeFixedMinor: parseMinor(form.withdrawalFixed),
      withdrawalFeeMinMinor: parseMinor(form.withdrawalMin),
      minDepositMinor: parseMinor(form.minDeposit),
      minWithdrawalMinor: parseMinor(form.minWithdrawal),
      autoCreditOn: form.autoCredit,
      creditWithoutAml: form.creditWithoutAml,
      amlMaxRisk: int(form.amlMaxRisk),
      confirmationsNeeded: int(form.confirmations),
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  try {
    await updateSettings(prisma, acting(operator), patch)
    revalidatePath('/admin/settings/fees')
    revalidatePath('/admin/deposits')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Калькулятор-превью. Считает тем же кодом, что и зачисление. */
export async function previewAction(
  amount: string,
): Promise<{ ok: true; fee: string; net: string } | { ok: false }> {
  await requireOperator()
  try {
    const preview = await previewFor(prisma, parseMinor(amount))
    return { ok: true, fee: preview.fee, net: preview.net }
  } catch {
    return { ok: false }
  }
}

function int(value: string): number {
  const parsed = Number(value.trim())
  if (!Number.isInteger(parsed)) throw new Error(`Не целое число: «${value}»`)
  return parsed
}

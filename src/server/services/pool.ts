/**
 * Пулы компаний: наш оборотный капитал в залоге у эмитента.
 *
 * Пул — **не** хранилище денег пользователей. Их крипта приходит на
 * наши отдельные кошельки; пул — наши собственные средства, которыми
 * обеспечены выданные лимиты (`docs/domain-and-money.md`, «Два контура
 * денег»). Поэтому покрытие — вопрос достаточности оборотных средств,
 * а не сохранности чужих денег.
 *
 * В нашей базе пул — **зеркало**, а не источник истины. Поэтому рядом
 * хранится отметка о времени чтения: считать инвариант по протухшему
 * числу опаснее, чем не считать вовсе, — ответ будет выглядеть
 * правдоподобно.
 */

import type { PrismaClient } from '@/generated/prisma/client'
import type { Minor } from '@/shared/money'
import { coverageBps, sumRemaining } from '../domain/invariants'
import type { OxenClient } from '../oxen'
import { money } from './cards'

/**
 * Пороги покрытия в базисных пунктах.
 *
 * Держатся константами, а не настройкой в базе: в утверждённом
 * интерфейсе поля для них нет, а поле в базе, которое никто не может
 * изменить, через полгода разъедется с тем, что написано на экране.
 * Когда их понадобится менять руками — переедут в настройки вместе
 * с экраном.
 */
export const COVERAGE_THRESHOLDS = {
  warn: 2000,
  low: 1500,
  urgent: 1000,
} as const

export type CoverageState = 'ok' | 'warn20' | 'warn15' | 'urgent10' | 'critical'

export function coverageState(bps: number | null): CoverageState {
  if (bps === null) return 'ok'
  if (bps < 0) return 'critical'
  if (bps <= COVERAGE_THRESHOLDS.urgent) return 'urgent10'
  if (bps <= COVERAGE_THRESHOLDS.low) return 'warn15'
  if (bps <= COVERAGE_THRESHOLDS.warn) return 'warn20'
  return 'ok'
}

export interface CompanyPool {
  id: string
  name: string
  oxenClientId: string
  isActive: boolean
  poolMinor: Minor
  /** Сумма неизрасходованных остатков по картам компании. */
  issuedMinor: Minor
  /** Пул минус остатки. Отрицательный запас означает, что карты уже
   *  могут отказывать: эмитент проверяет залог раньше лимита карты. */
  headroomMinor: Minor
  coverageBps: number | null
  state: CoverageState
  poolReadAt: Date | null
  /** Депозитный адрес пула. Приходит от эмитента, руками не задаётся. */
  depositAddress: string | null
}

/**
 * Покрытие по каждой компании.
 *
 * Считается в разрезе компании и только так: у каждой свой `cl_…`
 * и свой пул, и пул одной компании не покрывает карты другой
 * (CLAUDE.md, правило 5).
 */
export async function companyPools(prisma: PrismaClient): Promise<CompanyPool[]> {
  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } })
  const result: CompanyPool[] = []

  for (const company of companies) {
    const cards = await prisma.card.findMany({
      where: { status: { in: ['ACTIVE', 'FROZEN', 'CLOSING'] }, user: { companyId: company.id } },
    })
    const issued = sumRemaining(cards.map(money))
    const bps = coverageBps(company.poolAvailableMinor, cards.map(money))
    result.push({
      id: company.id,
      name: company.name,
      oxenClientId: company.oxenClientId,
      isActive: company.isActive,
      poolMinor: company.poolAvailableMinor,
      issuedMinor: issued,
      headroomMinor: company.poolAvailableMinor - issued,
      coverageBps: bps,
      state: coverageState(bps),
      poolReadAt: company.poolReadAt,
      depositAddress: company.poolDepositAddress,
    })
  }

  return result
}

/**
 * Перечитать пулы у эмитента.
 *
 * Сбой по одной компании не отменяет чтение остальных: иначе одна
 * недоступная компания оставила бы весь дашборд с протухшими числами.
 */
export async function refreshPools(
  prisma: PrismaClient,
  oxen: OxenClient,
): Promise<{ updated: number; failed: { companyId: string; error: string }[] }> {
  const companies = await prisma.company.findMany({ where: { isActive: true } })
  const failed: { companyId: string; error: string }[] = []
  let updated = 0

  for (const company of companies) {
    try {
      const funding = await oxen.getFunding(company.oxenClientId)
      // Депозитный адрес читается тем же проходом: отдельной кнопки
      // для него не нужно, а задавать его руками нельзя.
      const info = await oxen.getClient(company.oxenClientId)
      await prisma.company.update({
        where: { id: company.id },
        data: {
          poolAvailableMinor: funding.availableMinor,
          poolReadAt: new Date(),
          ...(info.depositAddress ? { poolDepositAddress: info.depositAddress } : {}),
        },
      })
      updated += 1
    } catch (error) {
      failed.push({
        companyId: company.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { updated, failed }
}

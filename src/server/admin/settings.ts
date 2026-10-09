/**
 * Настройки для админки: комиссии, сети, операторы, компании.
 *
 * Все суммы отдаются готовыми строками в единицах, в которых их видит
 * оператор: ставка — в базисных пунктах, фиксированная часть и
 * минимумы — в долларах. Поля ввода читают и пишут ровно то, что
 * показано, иначе «2.00» однажды уедет в базу как две копейки.
 */

import type { PrismaClient } from '@/generated/prisma/client'
import { formatMinor } from '@/shared/money'
import { calcFee } from '../domain/fees'
import { previewDeposit } from '../services/deposits'
import { companyPools } from '../services/pool'
import { readSettings } from '../services/settings'
import { addressCounts } from './aggregates'

export interface FeesView {
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
  maxActiveCards: string
  /** Калькулятор-превью: расчёт по глобальной ставке на 1000.00. */
  preview: { gross: string; fee: string; net: string }
  overrides: {
    userId: string
    userName: string
    companyName: string
    deposit: string | null
    withdrawal: string | null
  }[]
}

export async function feesView(prisma: PrismaClient): Promise<FeesView> {
  const settings = await readSettings(prisma)

  const overrides = await prisma.user.findMany({
    where: { OR: [{ depositFeeBps: { not: null } }, { withdrawalFeeBps: { not: null } }] },
    include: { company: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
    take: 200,
  })

  return {
    depositBps: String(settings.depositFeeBps),
    depositFixed: formatMinor(settings.depositFeeFixedMinor),
    depositMin: formatMinor(settings.depositFeeMinMinor),
    withdrawalBps: String(settings.withdrawalFeeBps),
    withdrawalFixed: formatMinor(settings.withdrawalFeeFixedMinor),
    withdrawalMin: formatMinor(settings.withdrawalFeeMinMinor),
    minDeposit: formatMinor(settings.minDepositMinor),
    minWithdrawal: formatMinor(settings.minWithdrawalMinor),
    autoCredit: settings.autoCreditOn,
    creditWithoutAml: settings.creditWithoutAml,
    amlMaxRisk: String(settings.amlMaxRisk),
    confirmations: String(settings.confirmationsNeeded),
    maxActiveCards: String(settings.maxActiveCards),
    preview: await previewFor(prisma, 100_000n),
    overrides: overrides.map((user) => ({
      userId: user.id,
      userName: user.fullName,
      companyName: user.company.name,
      deposit: user.depositFeeBps === null ? null : String(user.depositFeeBps),
      withdrawal: user.withdrawalFeeBps === null ? null : String(user.withdrawalFeeBps),
    })),
  }
}

/**
 * Калькулятор-превью.
 *
 * Считает **тем же кодом**, что и настоящее зачисление: отдельный
 * «показательный» расчёт однажды разойдётся с настоящим, и оператор
 * будет обещать человеку одну сумму, а удержится другая.
 *
 * Пользователя здесь нет, поэтому индивидуальная ставка не
 * применяется: превью показывает глобальную.
 */
export async function previewFor(
  prisma: PrismaClient,
  grossMinor: bigint,
): Promise<{ gross: string; fee: string; net: string }> {
  const settings = await readSettings(prisma)
  const fee = calcFee(grossMinor, {
    bps: settings.depositFeeBps,
    fixedMinor: settings.depositFeeFixedMinor,
    minMinor: settings.depositFeeMinMinor,
  })
  return {
    gross: formatMinor(fee.grossMinor),
    fee: formatMinor(fee.feeMinor),
    net: formatMinor(fee.netMinor),
  }
}

/** Расчёт под конкретного пользователя — для карточки заявки. */
export async function previewForUser(
  prisma: PrismaClient,
  input: { userId: string; grossMinor: bigint; feeBpsOverride?: number },
) {
  const preview = await previewDeposit(prisma, input)
  return {
    fee: formatMinor(preview.feeMinor),
    net: formatMinor(preview.netMinor),
    bps: preview.bpsUsed,
    belowMinimum: preview.belowMinimum,
    minDeposit: formatMinor(preview.minDepositMinor),
  }
}

/* --------------------------------------------------------------------------
   Сети и монеты
   -------------------------------------------------------------------------- */

export interface NetworkView {
  id: string
  name: string
  asset: string
  iconUrl: string | null
  /** Требует memo/tag: по такой сети платёж без memo не опознать. */
  requiresMemo: boolean
  memoLabel: string | null
  isActive: boolean
  minDeposit: string | null
  minDepositOn: boolean
  issuedAddresses: number
}

export async function networksView(
  prisma: PrismaClient,
): Promise<{ networks: NetworkView[]; syncedAt: string | null }> {
  const settings = await readSettings(prisma)
  const networks = await prisma.network.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  const counts = await addressCounts(prisma)

  return {
    syncedAt: settings.networksSyncedAt?.toISOString() ?? null,
    networks: networks.map((network) => ({
      id: network.id,
      name: network.name,
      asset: network.asset,
      iconUrl: network.iconUrl,
      requiresMemo: network.memoLabel !== null,
      memoLabel: network.memoLabel,
      isActive: network.isActive,
      minDeposit: network.minDepositMinor === null ? null : formatMinor(network.minDepositMinor),
      minDepositOn: network.minDepositOn,
      issuedAddresses: counts.get(network.id) ?? 0,
    })),
  }
}

/* --------------------------------------------------------------------------
   Операторы
   -------------------------------------------------------------------------- */

export interface OperatorView {
  id: string
  name: string
  email: string
  rights: string[]
  isSuperAdmin: boolean
  isActive: boolean
  /** Настроен ли второй фактор. Пока нет — оператор обязан настроить
   *  его при первом входе: админка двигает чужие деньги. */
  twoFactorEnabled: boolean
  lastSeenAt: string | null
}

export async function operatorsView(prisma: PrismaClient): Promise<OperatorView[]> {
  const operators = await prisma.operator.findMany({
    orderBy: [{ isSuperAdmin: 'desc' }, { fullName: 'asc' }],
    include: {
      sessions: {
        where: { revokedAt: null },
        orderBy: { lastSeenAt: 'desc' },
        take: 1,
        select: { lastSeenAt: true },
      },
    },
  })

  return operators.map((operator) => ({
    id: operator.id,
    name: operator.fullName,
    email: operator.email,
    rights: operator.rights,
    isSuperAdmin: operator.isSuperAdmin,
    isActive: operator.isActive,
    twoFactorEnabled: operator.totpConfirmedAt !== null,
    lastSeenAt: operator.sessions[0]?.lastSeenAt.toISOString() ?? null,
  }))
}

/* --------------------------------------------------------------------------
   Компании
   -------------------------------------------------------------------------- */

export interface CompanyView {
  id: string
  name: string
  oxenClientId: string
  isActive: boolean
  pool: string
  issued: string
  headroom: string
  coverage: string
  state: string
  poolReadAt: string | null
  depositAddress: string | null
  users: number
}

export async function companiesView(prisma: PrismaClient): Promise<CompanyView[]> {
  const pools = await companyPools(prisma)
  const counts = await prisma.user.groupBy({ by: ['companyId'], _count: { _all: true } })
  const byCompany = new Map(counts.map((row) => [row.companyId, row._count._all]))

  return pools.map((pool) => ({
    id: pool.id,
    name: pool.name,
    oxenClientId: pool.oxenClientId,
    isActive: pool.isActive,
    pool: formatMinor(pool.poolMinor),
    issued: formatMinor(pool.issuedMinor),
    headroom: formatMinor(pool.headroomMinor),
    coverage: pool.coverageBps === null ? '—' : (pool.coverageBps / 100).toFixed(1),
    state: pool.state,
    poolReadAt: pool.poolReadAt?.toISOString() ?? null,
    depositAddress: pool.depositAddress,
    users: byCompany.get(pool.id) ?? 0,
  }))
}

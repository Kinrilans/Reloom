/**
 * Дашборд.
 *
 * Порядок блоков не случаен. Первой строкой — **выручка**: это
 * первое, что спрашивают, и это наши деньги, а не деньги компаний
 * и пользователей. Дальше пулы: по ним видно, не начнут ли карты
 * отказывать. И только потом очередь работы.
 *
 * Разрез по компании берётся **готовым**. Складывать разрезы в коде
 * нельзя: это те же деньги, и сумма, посчитанная на экране,
 * разойдётся с суммой, посчитанной в леджере.
 */

import type { PrismaClient } from '@/generated/prisma/client'
import { formatMinor, type Minor } from '@/shared/money'
import { catchupStatus } from '../events'
import { companyPools, type CompanyPool } from '../services/pool'
import { feeIncome, inflowByNetwork, negativeBalanceUserIds } from './aggregates'
import { QUEUE_STATUSES } from './deposits'
import { STUCK_OXEN_STATUSES } from './users'

export interface PoolCardView {
  id: string
  name: string
  pool: string
  issued: string
  headroom: string
  /** Покрытие готовой строкой: «24.0». */
  coverage: string
  state: CompanyPool['state']
  poolReadAt: string | null
}

export interface RevenueView {
  profit: string
  fromDeposits: string
  fromWithdrawals: string
  inflow: string
  networks: { id: string; name: string; asset: string; amount: string; share: string }[]
}

export interface DashboardView {
  revenue: RevenueView
  pools: PoolCardView[]
  queue: {
    deposits: number
    oldestDepositAt: string | null
    negativeUsers: number
    pendingTransfers: number
    stuckUsers: number
    closingCards: number
    integrationErrors: number
    recoveryLinks: number
  }
  health: {
    eventLagSeconds: number | null
    unprocessedEvents: number
    lastPoolRead: string | null
    throttling: boolean
  }
}

export async function dashboard(
  prisma: PrismaClient,
  options: { companyId?: string | undefined; now?: Date } = {},
): Promise<DashboardView> {
  const now = options.now ?? new Date()
  const companyId = options.companyId
  // Период выручки — текущий месяц. Период фиксирован нарочно: «за всё
  // время» на дашборде выглядит как «за месяц» и читается неверно.
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

  const fees = await feeIncome(prisma, { from, to, ...(companyId ? { companyId } : {}) })
  const inflow = await inflowByNetwork(prisma, { from, to, ...(companyId ? { companyId } : {}) })
  const inflowTotal = inflow.reduce<Minor>((sum, slice) => sum + slice.amount, 0n)

  const pools = (await companyPools(prisma)).filter(
    (pool) => companyId === undefined || pool.id === companyId,
  )

  const userScope = companyId ? { user: { companyId } } : {}

  const depositsInQueue = await prisma.depositRequest.count({
    where: { status: { in: QUEUE_STATUSES }, ...userScope },
  })
  const oldestDeposit = await prisma.depositRequest.findFirst({
    where: { status: { in: QUEUE_STATUSES }, ...userScope },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })
  const negative = await negativeBalanceUserIds(prisma, companyId)
  const pendingTransfers = await prisma.cardTransfer.count({
    where: { status: { in: ['PENDING', 'SOURCE_REDUCED'] }, ...userScope },
  })
  const stuckUsers = await prisma.user.count({
    where: { oxenStatus: { in: STUCK_OXEN_STATUSES }, ...(companyId ? { companyId } : {}) },
  })
  const closingCards = await prisma.card.count({ where: { status: 'CLOSING', ...userScope } })
  const integrationErrors = await prisma.exchangeLog.count({
    where: { outcome: 'FAILED', createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) } },
  })
  // Привязки нового Telegram по коду восстановления за сутки. Пока
  // привязки делает только бот (этап 5), запись в аудите появляется
  // оттуда же, и до него здесь честный ноль.
  const recoveryLinks = await prisma.auditLog.count({
    where: {
      action: 'TELEGRAM_LINKED_BY_RECOVERY',
      createdAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
    },
  })

  const catchup = await catchupStatus(prisma, now)
  const lastPoolRead = pools.reduce<Date | null>(
    (latest, pool) =>
      pool.poolReadAt && (!latest || pool.poolReadAt > latest) ? pool.poolReadAt : latest,
    null,
  )
  const throttling =
    (await prisma.exchangeLog.count({
      where: {
        service: 'OXEN',
        errorCode: 'UNAUTHORIZED',
        createdAt: { gte: new Date(now.getTime() - 5 * 60 * 1000) },
      },
    })) >= 3

  return {
    revenue: {
      profit: formatMinor(fees.total),
      fromDeposits: formatMinor(fees.fromDeposits),
      fromWithdrawals: formatMinor(fees.fromWithdrawals),
      inflow: formatMinor(inflowTotal),
      networks: inflow.map((slice) => ({
        id: slice.networkId,
        name: slice.name,
        asset: slice.asset,
        amount: formatMinor(slice.amount),
        share: sharePercent(slice.amount, inflowTotal),
      })),
    },
    pools: pools.map((pool) => ({
      id: pool.id,
      name: pool.name,
      pool: formatMinor(pool.poolMinor),
      issued: formatMinor(pool.issuedMinor),
      headroom: formatMinor(pool.headroomMinor),
      coverage: pool.coverageBps === null ? '—' : (pool.coverageBps / 100).toFixed(1),
      state: pool.state,
      poolReadAt: pool.poolReadAt?.toISOString() ?? null,
    })),
    queue: {
      deposits: depositsInQueue,
      oldestDepositAt: oldestDeposit?.createdAt.toISOString() ?? null,
      negativeUsers: negative.length,
      pendingTransfers,
      stuckUsers,
      closingCards,
      integrationErrors,
      recoveryLinks,
    },
    health: {
      eventLagSeconds: catchup.lagSeconds,
      unprocessedEvents: catchup.unprocessed,
      lastPoolRead: lastPoolRead?.toISOString() ?? null,
      throttling,
    },
  }
}

/**
 * Доля в процентах, одной десятой.
 *
 * Считается **не над деньгами**, а над их отношением, и результат —
 * строка для показа. В расчётах эта величина не участвует нигде.
 */
function sharePercent(part: Minor, total: Minor): string {
  if (total === 0n) return '0.0'
  // Умножение на 1000 до деления: целочисленное деление сначала дало
  // бы ноль, а переход в число с плавающей точкой над суммами
  // запрещён (CLAUDE.md, правило 1).
  const permille = (part * 1000n) / total
  return (Number(permille) / 10).toFixed(1)
}

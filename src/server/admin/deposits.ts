/**
 * Пополнения для админки.
 *
 * Экран меняет смысл от настройки: при включённом автозачислении это
 * **история** зачислений, при выключенном — **очередь** решений.
 * Очередь существует в обоих режимах: в неё падает всё, что система
 * зачислить не смогла.
 *
 * Сортировка по умолчанию — старые сверху. Заявка, висящая сутки,
 * должна быть первой строкой, а не последней.
 */

import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import { formatMinor } from '@/shared/money'
import { CLAIM_TTL_MS, previewDeposit } from '../services/deposits'
import { balancesOf } from './aggregates'

export type DepositFilter = 'queue' | 'all' | 'SUBMITTED' | 'HELD' | 'CREDITED' | 'REJECTED' | 'REFUNDED'

export interface DepositRow {
  id: string
  userId: string
  userName: string
  companyId: string
  companyName: string
  /** Заявленная или фактически полученная — что известно. */
  amount: string
  asset: string
  network: string
  status: string
  source: string
  amlVerdict: string | null
  amlRisk: number | null
  txLink: string | null
  createdAt: string
  /** Кто разбирает заявку прямо сейчас. Пометка, а не запрет: запрет
   *  держится на сервере, захватом и версией записи. */
  claimedBy: string | null
  claimedByName: string | null
}

export interface ListDepositsQuery {
  companyId?: string | undefined
  filter: DepositFilter
  search?: string | undefined
  page: number
  pageSize: number
  now?: Date
}

/** Статусы, которые ждут решения оператора. */
export const QUEUE_STATUSES = ['SUBMITTED', 'HELD']

export async function listDeposits(
  prisma: PrismaClient,
  query: ListDepositsQuery,
): Promise<{ rows: DepositRow[]; total: number; queueSize: number }> {
  const userWhere: Prisma.UserWhereInput = {}
  if (query.companyId) userWhere.companyId = query.companyId
  if (query.search && query.search.trim() !== '') {
    userWhere.fullName = { contains: query.search.trim(), mode: 'insensitive' }
  }

  const where: Prisma.DepositRequestWhereInput = {}
  if (Object.keys(userWhere).length > 0) where.user = userWhere
  if (query.filter === 'queue') where.status = { in: QUEUE_STATUSES }
  else if (query.filter !== 'all') where.status = query.filter

  const total = await prisma.depositRequest.count({ where })
  const queueSize = await prisma.depositRequest.count({
    where: {
      status: { in: QUEUE_STATUSES },
      ...(query.companyId ? { user: { companyId: query.companyId } } : {}),
    },
  })

  const rows = await prisma.depositRequest.findMany({
    where,
    include: {
      user: { include: { company: { select: { name: true } } } },
      network: true,
    },
    // Старые сверху: заявка, висящая сутки, должна быть первой.
    orderBy: { createdAt: 'asc' },
    skip: query.page * query.pageSize,
    take: query.pageSize,
  })

  const now = query.now ?? new Date()
  const claimers = await operatorNames(prisma, rows.map((row) => row.claimedBy))

  return {
    total,
    queueSize,
    rows: rows.map((row) => {
      const claimedBy = activeClaim(row, now)
      return {
        id: row.id,
        userId: row.userId,
        userName: row.user.fullName,
        companyId: row.user.companyId,
        companyName: row.user.company.name,
        amount: formatMinor(row.receivedMinor ?? row.declaredMinor ?? 0n),
        asset: row.network.asset,
        network: row.network.name,
        status: row.status,
        source: row.source,
        amlVerdict: row.amlVerdict,
        amlRisk: row.amlRisk,
        txLink: row.txLink,
        createdAt: row.createdAt.toISOString(),
        claimedBy,
        claimedByName: claimedBy ? (claimers.get(claimedBy) ?? null) : null,
      }
    }),
  }
}

export interface DepositDetail extends DepositRow {
  declared: string
  received: string | null
  fee: string | null
  net: string | null
  address: string | null
  fromAddress: string | null
  memo: string | null
  userBalance: string
  rejectReasonCode: string | null
  rejectReasonText: string | null
  /** Прошлые пополнения этого пользователя. */
  history: { id: string; amount: string; status: string; at: string }[]
  /** Расчёт на заявленную сумму: он же пересчитывается, когда оператор
   *  вводит фактически полученную. */
  preview: { fee: string; net: string; bps: number; belowMinimum: boolean; minDeposit: string }
}

export async function depositDetail(
  prisma: PrismaClient,
  depositId: string,
  now: Date = new Date(),
): Promise<DepositDetail | null> {
  const row = await prisma.depositRequest.findUnique({
    where: { id: depositId },
    include: {
      user: { include: { company: { select: { name: true } } } },
      network: true,
      address: true,
    },
  })
  if (!row) return null

  const { previewDeposit } = await import('../services/deposits')
  const gross = row.receivedMinor ?? row.declaredMinor ?? 0n
  const preview = await previewDeposit(prisma, { userId: row.userId, grossMinor: gross })

  const history = await prisma.depositRequest.findMany({
    where: { userId: row.userId, id: { not: row.id } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  const balance = (await balancesOf(prisma, [row.userId])).get(row.userId) ?? 0n
  const claimedBy = activeClaim(row, now)
  const claimers = await operatorNames(prisma, [claimedBy])

  return {
    id: row.id,
    userId: row.userId,
    userName: row.user.fullName,
    companyId: row.user.companyId,
    companyName: row.user.company.name,
    amount: formatMinor(gross),
    declared: formatMinor(row.declaredMinor ?? 0n),
    received: row.receivedMinor === null ? null : formatMinor(row.receivedMinor),
    fee: row.feeMinor === null ? null : formatMinor(row.feeMinor),
    net:
      row.receivedMinor === null
        ? null
        : formatMinor(row.receivedMinor - (row.feeMinor ?? 0n)),
    asset: row.network.asset,
    network: row.network.name,
    status: row.status,
    source: row.source,
    amlVerdict: row.amlVerdict,
    amlRisk: row.amlRisk,
    txLink: row.txLink,
    createdAt: row.createdAt.toISOString(),
    claimedBy,
    claimedByName: claimedBy ? (claimers.get(claimedBy) ?? null) : null,
    address: row.address.address,
    memo: row.address.memo,
    fromAddress: row.fromAddress,
    userBalance: formatMinor(balance),
    rejectReasonCode: row.rejectReasonCode,
    rejectReasonText: row.rejectReasonText,
    history: history.map((item) => ({
      id: item.id,
      amount: formatMinor(item.receivedMinor ?? item.declaredMinor ?? 0n),
      status: item.status,
      at: item.createdAt.toISOString(),
    })),
    preview: {
      fee: formatMinor(preview.feeMinor),
      net: formatMinor(preview.netMinor),
      bps: preview.bpsUsed,
      belowMinimum: preview.belowMinimum,
      minDeposit: formatMinor(preview.minDepositMinor),
    },
  }
}

/**
 * Захват, который ещё действует.
 *
 * Протухший захват — это не «занято»: ушедший на обед оператор не
 * должен блокировать заявку навсегда. Срок тот же, что проверяет
 * сервер при подтверждении, и берётся из той же константы.
 */
function activeClaim(
  row: { claimedBy: string | null; claimedAt: Date | null },
  now: Date,
): string | null {
  if (!row.claimedBy || !row.claimedAt) return null
  if (now.getTime() - row.claimedAt.getTime() > CLAIM_TTL_MS) return null
  return row.claimedBy
}

async function operatorNames(
  prisma: PrismaClient,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))]
  if (unique.length === 0) return new Map()
  const operators = await prisma.operator.findMany({
    where: { id: { in: unique } },
    select: { id: true, fullName: true },
  })
  return new Map(operators.map((operator) => [operator.id, operator.fullName]))
}

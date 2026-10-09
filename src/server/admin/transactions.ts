/**
 * Транзакции платформы — зеркало операций по картам.
 *
 * Аномалии подсвечиваются маркером: списание больше авторизованного,
 * `forcePosted`, списание без авторизации. Это те три случая, из-за
 * которых баланс расходится с ожиданиями человека, и находить их
 * глазами в списке на сотню строк нельзя.
 *
 * Название мерчанта приходит от эмитента сырым и **не переводится
 * никогда** (CLAUDE.md, правило 3e).
 */

import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import { formatMinor } from '@/shared/money'
import { anomalousTransactionIds } from './aggregates'

export type Anomaly = 'OVER_AUTH' | 'FORCE_POSTED' | 'NO_AUTH'

export interface TransactionRow {
  id: string
  at: string
  userId: string
  userName: string
  companyId: string
  companyName: string
  cardId: string
  cardLast4: string | null
  merchant: string | null
  /** Сумма расчёта, в валюте карты. Леджер ведётся по ней. */
  amount: string
  currency: string
  /** Запрошено мерчантом, в его валюте. Только для показа. */
  localAmount: string | null
  localCurrency: string | null
  status: string
  /** Состояние на языке интерфейса. */
  display: 'pending' | 'completed' | 'declined' | 'refund' | 'reversed'
  type: string
  declineReason: string | null
  anomaly: Anomaly | null
}

/**
 * Отбор по состоянию — в словаре интерфейса, а не в вокабуляре
 * эмитента. Авторизация для оператора «в пути», осевшая покупка
 * «прошла», а возврат — отдельная строка отбора, хотя у эмитента это
 * тот же статус с другим типом.
 */
export type TransactionFilter =
  | 'all'
  | 'pending'
  | 'completed'
  | 'declined'
  | 'refund'
  | 'reversed'
  | 'anomaly'

export interface ListTransactionsQuery {
  companyId?: string | undefined
  userId?: string | undefined
  cardId?: string | undefined
  status?: TransactionFilter | undefined
  from?: Date | undefined
  to?: Date | undefined
  search?: string | undefined
  page: number
  pageSize: number
}

export async function listTransactions(
  prisma: PrismaClient,
  query: ListTransactionsQuery,
): Promise<{ rows: TransactionRow[]; total: number }> {
  const where: Prisma.CardTransactionWhereInput = {}
  if (query.companyId) where.companyId = query.companyId
  if (query.userId) where.userId = query.userId
  if (query.cardId) where.cardId = query.cardId
  if (query.status && query.status !== 'all') {
    if (query.status === 'anomaly') {
      where.id = { in: await anomalousTransactionIds(prisma) }
    } else if (query.status === 'refund') {
      where.type = 'REFUND'
      where.status = 'SETTLED'
    } else if (query.status === 'completed') {
      where.status = 'SETTLED'
      where.type = { not: 'REFUND' }
    } else if (query.status === 'pending') {
      where.status = 'AUTHORIZED'
    } else if (query.status === 'declined') {
      where.status = 'DECLINED'
    } else {
      where.status = 'REVERSED'
    }
  }
  if (query.from || query.to) {
    where.occurredAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lt: query.to } : {}),
    }
  }
  if (query.search && query.search.trim() !== '') {
    where.merchantName = { contains: query.search.trim(), mode: 'insensitive' }
  }

  const total = await prisma.cardTransaction.count({ where })
  const rows = await prisma.cardTransaction.findMany({
    where,
    include: {
      card: { select: { last4: true } },
      user: { include: { company: { select: { name: true } } } },
    },
    orderBy: { occurredAt: 'desc' },
    skip: query.page * query.pageSize,
    take: query.pageSize,
  })

  return { total, rows: rows.map(toRow) }
}

type Row = Prisma.CardTransactionGetPayload<{
  include: {
    card: { select: { last4: true } }
    user: { include: { company: { select: { name: true } } } }
  }
}>

function toRow(transaction: Row): TransactionRow {
  return {
    id: transaction.id,
    at: transaction.occurredAt.toISOString(),
    userId: transaction.userId,
    userName: transaction.user.fullName,
    companyId: transaction.companyId,
    companyName: transaction.user.company.name,
    cardId: transaction.cardId,
    cardLast4: transaction.card.last4,
    merchant: transaction.merchantName,
    amount: formatMinor(transaction.amountMinor),
    currency: transaction.currency,
    localAmount: transaction.localAmount === null ? null : formatMinor(transaction.localAmount),
    localCurrency: transaction.localCurrency,
    status: transaction.status,
    display: displayStatus(transaction),
    type: transaction.type,
    declineReason: transaction.declineReason,
    anomaly: anomalyOf(transaction),
  }
}

/**
 * Состояние операции на языке оператора.
 *
 * У эмитента возврат — это `SETTLED` с типом `REFUND`, а авторизация
 * и списание различаются статусом. Для человека это разные строки,
 * и подпись у них своя.
 */
export function displayStatus(transaction: { status: string; type: string }): TransactionRow['display'] {
  if (transaction.status === 'DECLINED') return 'declined'
  if (transaction.status === 'REVERSED') return 'reversed'
  if (transaction.status === 'AUTHORIZED') return 'pending'
  if (transaction.type === 'REFUND') return 'refund'
  return 'completed'
}

/**
 * Что в операции не так.
 *
 * `OVER_AUTH` — списано больше, чем было одобрено: курс ушёл или
 * мерчант добавил чаевые. `NO_AUTH` — списание без авторизации:
 * офлайн-операция, которую карта не могла отклонить. `FORCE_POSTED` —
 * эмитент провёл операцию принудительно.
 *
 * Проверяется по сохранённой сумме авторизации: чтение транзакции
 * у эмитента её затирает, поэтому она сохраняется из события и
 * задним числом не восстанавливается.
 */
export function anomalyOf(transaction: {
  status: string
  amountMinor: bigint
  authorizedAmount: bigint | null
  forcePosted: boolean | null
  type: string
}): Anomaly | null {
  if (transaction.forcePosted === true) return 'FORCE_POSTED'
  if (transaction.status !== 'SETTLED') return null
  if (transaction.type === 'REFUND') return null
  if (transaction.authorizedAmount === null) return 'NO_AUTH'
  if (transaction.amountMinor > transaction.authorizedAmount) return 'OVER_AUTH'
  return null
}

export interface TransactionDetail extends TransactionRow {
  authorized: string | null
  authorizedLocal: string | null
  /** Сырой ответ эмитента — для разбора. Реквизитов в нём нет:
   *  открытый PAN на наш сервер не попадает вовсе. */
  raw: unknown
  forcePosted: boolean | null
  /** Проводка в леджере, если она есть. У авторизации её нет. */
  ledger: { id: string; type: string; amount: string; at: string } | null
}

export async function transactionDetail(
  prisma: PrismaClient,
  id: string,
): Promise<TransactionDetail | null> {
  const transaction = await prisma.cardTransaction.findUnique({
    where: { id },
    include: {
      card: { select: { last4: true } },
      user: { include: { company: { select: { name: true } } } },
    },
  })
  if (!transaction) return null

  const ledger = await prisma.ledgerTransaction.findFirst({
    where: { sourceType: 'CARD_TX', sourceId: id },
    include: { entries: { where: { account: `USER:${transaction.userId}` } } },
  })

  return {
    ...toRow(transaction),
    authorized:
      transaction.authorizedAmount === null ? null : formatMinor(transaction.authorizedAmount),
    authorizedLocal:
      transaction.authorizedLocalAmount === null
        ? null
        : formatMinor(transaction.authorizedLocalAmount),
    raw: transaction.raw,
    forcePosted: transaction.forcePosted,
    ledger: ledger
      ? {
          id: ledger.id,
          type: ledger.type,
          amount: formatMinor(
            ledger.entries.reduce<bigint>((sum, entry) => sum + entry.amountMinor, 0n),
          ),
          at: ledger.createdAt.toISOString(),
        }
      : null,
  }
}

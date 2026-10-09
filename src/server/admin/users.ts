/**
 * Список и карточка пользователя для админки.
 *
 * Чтение, и только чтение: ничего здесь не меняется. Денежные
 * величины отдаются **готовыми строками** — ровно теми, что рисует
 * экран. Причина не в удобстве: `bigint` через границу серверного
 * компонента не проходит, и отдавать суммы числами значило бы
 * превращать их в `number` (CLAUDE.md, правило 1).
 *
 * Отбор, поиск и страницы считаются **в базе**. Список обязан
 * работать на тысяче строк, а «загрузить всё и отфильтровать
 * в памяти» на тысяче строк работает ровно до того дня, когда их
 * станет десять тысяч.
 */

import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import { formatMinor } from '@/shared/money'
import { availableToSpend, money, unallocated } from '../services/cards'
import { moneySummary } from '../services/users'
import { remainingOf, spentOf } from '../domain/limits'
import { balancesOf, cardAggregatesOf, negativeBalanceUserIds } from './aggregates'

/** Статусы картхолдера, которые разрешаются только обращением
 *  к менеджеру эмитента: у нас роутов обновления картхолдера нет. */
export const STUCK_OXEN_STATUSES = ['NEEDS_REVIEW', 'NEEDS_INFO', 'REJECTED']

export type UserFilter = 'ACTIVE' | 'BLOCKED' | 'negative' | 'stuck' | 'all'

export interface UserRow {
  id: string
  name: string
  companyId: string
  companyName: string
  status: string
  oxenStatus: string | null
  balance: string
  negative: boolean
  cards: number
  email: string | null
}

export interface ListUsersQuery {
  companyId?: string | undefined
  filter: UserFilter
  search?: string | undefined
  page: number
  pageSize: number
}

export interface Page<T> {
  rows: T[]
  total: number
}

export async function listUsers(
  prisma: PrismaClient,
  query: ListUsersQuery,
): Promise<Page<UserRow>> {
  const where: Prisma.UserWhereInput = {}
  if (query.companyId) where.companyId = query.companyId
  if (query.search && query.search.trim() !== '') {
    const search = query.search.trim()
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (query.filter === 'ACTIVE' || query.filter === 'BLOCKED') where.status = query.filter
  if (query.filter === 'stuck') where.oxenStatus = { in: STUCK_OXEN_STATUSES }
  if (query.filter === 'negative') {
    // Отбор по балансу — отбор по сумме проводок. Поля «баланс»
    // у нас нет, поэтому сначала считаем, у кого он отрицательный.
    where.id = { in: await negativeBalanceUserIds(prisma, query.companyId) }
  }

  const total = await prisma.user.count({ where })
  const users = await prisma.user.findMany({
    where,
    include: { company: { select: { name: true } } },
    orderBy: [{ createdAt: 'desc' }],
    skip: query.page * query.pageSize,
    take: query.pageSize,
  })

  const ids = users.map((user) => user.id)
  const balances = await balancesOf(prisma, ids)
  const cards = await cardAggregatesOf(prisma, ids)

  return {
    total,
    rows: users.map((user) => {
      const balance = balances.get(user.id) ?? 0n
      return {
        id: user.id,
        name: user.fullName,
        companyId: user.companyId,
        companyName: user.company.name,
        status: user.status,
        oxenStatus: user.oxenStatus,
        balance: formatMinor(balance),
        negative: balance < 0n,
        cards: cards.get(user.id)?.liveCards ?? 0,
        email: user.email,
      }
    }),
  }
}

/* --------------------------------------------------------------------------
   Карточка
   -------------------------------------------------------------------------- */

export interface UserCardView {
  id: string
  name: string
  email: string | null
  companyId: string
  companyName: string
  status: string
  blockReason: string | null
  oxenStatus: string | null
  oxenCardholderId: string | null
  telegram: string | null
  createdAt: string
  balance: string
  negative: boolean
  /** Нераспределённый остаток: внесено, но ещё не лежит ни на одной
   *  карте. В обычной работе ноль. */
  unallocated: string
  available: string
  money: { deposited: string; spent: string; fees: string; withdrawn: string; refunded: string }
  depositFeeBps: number | null
  withdrawalFeeBps: number | null
  cards: UserCardItem[]
  canceledCards: UserCardItem[]
  history: HistoryItem[]
  deposits: DepositHistoryItem[]
  pendingTransfers: { id: string; amount: string; status: string; at: string }[]
}

export interface UserCardItem {
  id: string
  last4: string | null
  isPrimary: boolean
  status: string
  freezeReason: string | null
  applied: string
  spent: string
  available: string
  /** Удерживается по незакрытым авторизациям. */
  held: string
  createdAt: string
}

export interface HistoryItem {
  id: string
  type: string
  /** Сумма со знаком, как показывается. */
  amount: string
  at: string
  reason: string | null
  operatorId: string | null
}

export interface DepositHistoryItem {
  id: string
  status: string
  amount: string
  asset: string
  network: string
  at: string
}

export async function userCard(
  prisma: PrismaClient,
  userId: string,
): Promise<UserCardView | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { company: true, cards: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
  })
  if (!user) return null

  const balance = (await balancesOf(prisma, [user.id])).get(user.id) ?? 0n
  const summary = await moneySummary(prisma, user.id)

  const transactions = await prisma.ledgerTransaction.findMany({
    where: { userId: user.id },
    include: { entries: { where: { account: `USER:${user.id}` } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const deposits = await prisma.depositRequest.findMany({
    where: { userId: user.id },
    include: { network: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  const transfers = await prisma.cardTransfer.findMany({
    where: { userId: user.id, status: { in: ['PENDING', 'SOURCE_REDUCED'] } },
    orderBy: { createdAt: 'desc' },
  })

  const toItem = (card: (typeof user.cards)[number]): UserCardItem => ({
    id: card.id,
    last4: card.last4,
    isPrimary: card.isPrimary,
    status: card.status,
    freezeReason: card.freezeReason,
    applied: formatMinor(card.appliedLimit),
    spent: formatMinor(spentOf(money(card))),
    available: formatMinor(remainingOf(money(card))),
    held: formatMinor(card.pendingMinor),
    createdAt: card.createdAt.toISOString(),
  })

  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    companyId: user.companyId,
    companyName: user.company.name,
    status: user.status,
    blockReason: user.blockReason,
    oxenStatus: user.oxenStatus,
    oxenCardholderId: user.oxenCardholderId,
    telegram: user.telegramUserId === null ? null : String(user.telegramUserId),
    createdAt: user.createdAt.toISOString(),
    balance: formatMinor(balance),
    negative: balance < 0n,
    unallocated: formatMinor(await unallocated(prisma, user.id)),
    available: formatMinor(await availableToSpend(prisma, user.id)),
    money: {
      deposited: formatMinor(summary.deposited),
      spent: formatMinor(summary.spent),
      fees: formatMinor(summary.fees),
      withdrawn: formatMinor(summary.withdrawn),
      refunded: formatMinor(summary.refunded),
    },
    depositFeeBps: user.depositFeeBps,
    withdrawalFeeBps: user.withdrawalFeeBps,
    cards: user.cards.filter((card) => card.status !== 'CANCELED').map(toItem),
    canceledCards: user.cards.filter((card) => card.status === 'CANCELED').map(toItem),
    history: transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: formatMinor(
        transaction.entries.reduce<bigint>((sum, entry) => sum + entry.amountMinor, 0n),
      ),
      at: transaction.createdAt.toISOString(),
      reason: transaction.reason,
      operatorId: transaction.operatorId,
    })),
    deposits: deposits.map((deposit) => ({
      id: deposit.id,
      status: deposit.status,
      amount: formatMinor(deposit.receivedMinor ?? deposit.declaredMinor ?? 0n),
      asset: deposit.network.asset,
      network: deposit.network.name,
      at: deposit.createdAt.toISOString(),
    })),
    pendingTransfers: transfers.map((transfer) => ({
      id: transfer.id,
      amount: formatMinor(transfer.amountMinor),
      status: transfer.status,
      at: transfer.createdAt.toISOString(),
    })),
  }
}

/** Компании для переключателя в шапке. */
export async function companyOptions(prisma: PrismaClient) {
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
  return companies
}

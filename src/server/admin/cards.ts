/**
 * Карты для админки.
 *
 * Потолок, потраченное и остаток показываются **рядом**. Это не
 * украшение: потолок не уменьшается при тратах, и показать один
 * потолок значит показать число, которое оператор прочтёт как
 * «доступно» и ошибётся на всю сумму трат (CLAUDE.md, правило 3a).
 *
 * Отдельной колонкой идёт удерживаемое по незакрытым авторизациям:
 * без неё непонятно, почему карту нельзя отменить.
 */

import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import { formatMinor } from '@/shared/money'
import { cancelBlockers, remainingOf, spentOf } from '../domain/limits'
import { money } from '../services/cards'

export type CardFilter = 'all' | 'ACTIVE' | 'FROZEN' | 'CLOSING' | 'CANCELED'
export type CardKind = 'all' | 'primary' | 'child'

export interface CardRow {
  id: string
  last4: string | null
  userId: string
  userName: string
  companyId: string
  companyName: string
  isPrimary: boolean
  status: string
  freezeReason: string | null
  applied: string
  spent: string
  available: string
  held: string
  createdAt: string
}

export interface ListCardsQuery {
  companyId?: string | undefined
  status: CardFilter
  kind: CardKind
  search?: string | undefined
  page: number
  pageSize: number
}

export async function listCards(
  prisma: PrismaClient,
  query: ListCardsQuery,
): Promise<{ rows: CardRow[]; total: number }> {
  const where: Prisma.CardWhereInput = {}
  const userWhere: Prisma.UserWhereInput = {}
  if (query.companyId) userWhere.companyId = query.companyId
  if (query.search && query.search.trim() !== '') {
    userWhere.fullName = { contains: query.search.trim(), mode: 'insensitive' }
  }
  if (Object.keys(userWhere).length > 0) where.user = userWhere
  if (query.status !== 'all') where.status = query.status
  if (query.kind !== 'all') where.isPrimary = query.kind === 'primary'

  const total = await prisma.card.count({ where })
  const cards = await prisma.card.findMany({
    where,
    include: { user: { include: { company: { select: { name: true } } } } },
    orderBy: [{ createdAt: 'desc' }],
    skip: query.page * query.pageSize,
    take: query.pageSize,
  })

  return { total, rows: cards.map(toRow) }
}

function toRow(card: {
  id: string
  last4: string | null
  userId: string
  isPrimary: boolean
  status: string
  freezeReason: string | null
  appliedLimit: bigint
  settledMinor: bigint
  pendingMinor: bigint
  createdAt: Date
  user: { fullName: string; companyId: string; company: { name: string } }
}): CardRow {
  return {
    id: card.id,
    last4: card.last4,
    userId: card.userId,
    userName: card.user.fullName,
    companyId: card.user.companyId,
    companyName: card.user.company.name,
    isPrimary: card.isPrimary,
    status: card.status,
    freezeReason: card.freezeReason,
    applied: formatMinor(card.appliedLimit),
    spent: formatMinor(spentOf(money(card))),
    available: formatMinor(remainingOf(money(card))),
    held: formatMinor(card.pendingMinor),
    createdAt: card.createdAt.toISOString(),
  }
}

export interface CardDetail extends CardRow {
  oxenCardId: string
  closingPlan: unknown
  /** Что мешает отменить карту прямо сейчас. Пусто — можно отменять. */
  blockers: string[]
  /** Незакрытые операции: именно они держат резерв. */
  openOperations: { id: string; merchant: string | null; amount: string; at: string }[]
  recent: { id: string; merchant: string | null; amount: string; status: string; at: string }[]
  /** Карты того же пользователя — выбор, куда переносить остаток. */
  siblings: { id: string; last4: string | null; isPrimary: boolean; status: string }[]
}

export async function cardDetail(prisma: PrismaClient, cardId: string): Promise<CardDetail | null> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { user: { include: { company: { select: { name: true } } } } },
  })
  if (!card) return null

  const transactions = await prisma.cardTransaction.findMany({
    where: { cardId: card.id },
    orderBy: { occurredAt: 'desc' },
    take: 50,
  })

  const siblings = await prisma.card.findMany({
    where: { userId: card.userId, id: { not: card.id }, status: { in: ['ACTIVE', 'FROZEN'] } },
    select: { id: true, last4: true, isPrimary: true, status: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })

  return {
    ...toRow(card),
    oxenCardId: card.oxenCardId,
    closingPlan: card.closingPlan,
    blockers: cancelBlockers(money(card)),
    openOperations: transactions
      .filter((transaction) => transaction.status === 'AUTHORIZED')
      .map((transaction) => ({
        id: transaction.id,
        merchant: transaction.merchantName,
        amount: formatMinor(transaction.amountMinor),
        at: transaction.occurredAt.toISOString(),
      })),
    recent: transactions.map((transaction) => ({
      id: transaction.id,
      merchant: transaction.merchantName,
      amount: formatMinor(transaction.amountMinor),
      status: transaction.status,
      at: transaction.occurredAt.toISOString(),
    })),
    siblings,
  }
}

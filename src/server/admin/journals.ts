/**
 * Два журнала, и путать их нельзя.
 *
 * **Аудит** отвечает на вопрос «кто из операторов что сделал».
 * Его читают при разборе с человеком.
 *
 * **Журнал обмена** — «что ушло наружу и что пришло обратно».
 * Его читают при разборе с внешним сервисом.
 *
 * Записи аудита **неудаляемы**: это финансовая отчётность. Поэтому
 * здесь есть только чтение.
 */

import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import { isHighlighted } from '../audit'

export interface AuditRow {
  id: string
  at: string
  operatorId: string | null
  operatorName: string | null
  /** Код действия. В текст превращается при показе. */
  action: string
  targetTypeCode: string
  targetId: string
  /** Имя объекта — данные, их не переводят. */
  target: string | null
  companyId: string | null
  /** Название компании: в списке читают его, а не идентификатор. */
  companyName: string | null
  reasonCode: string | null
  reason: string | null
  /** Действие из тех, что выделяются отдельно: корректировки, выводы,
   *  права, переопределения ставок, автозачисление, адреса, возвраты. */
  highlight: boolean
  before: unknown
  after: unknown
}

export interface ListAuditQuery {
  companyId?: string | undefined
  operatorId?: string | undefined
  action?: string | undefined
  targetType?: string | undefined
  from?: Date | undefined
  to?: Date | undefined
  page: number
  pageSize: number
}

export async function listAudit(
  prisma: PrismaClient,
  query: ListAuditQuery,
): Promise<{ rows: AuditRow[]; total: number }> {
  const where: Prisma.AuditLogWhereInput = {}
  if (query.companyId) where.companyId = query.companyId
  if (query.operatorId) where.operatorId = query.operatorId
  if (query.action && query.action !== 'all') where.action = query.action
  if (query.targetType && query.targetType !== 'all') where.targetType = query.targetType
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lt: query.to } : {}),
    }
  }

  const total = await prisma.auditLog.count({ where })
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: query.page * query.pageSize,
    take: query.pageSize,
  })

  const operators = await prisma.operator.findMany({ select: { id: true, fullName: true } })
  const names = new Map(operators.map((operator) => [operator.id, operator.fullName]))

  const companies = await prisma.company.findMany({ select: { id: true, name: true } })
  const companyNames = new Map(companies.map((company) => [company.id, company.name]))

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      at: row.createdAt.toISOString(),
      operatorId: row.operatorId,
      operatorName: row.operatorId ? (names.get(row.operatorId) ?? null) : null,
      action: row.action,
      targetTypeCode: row.targetType,
      targetId: row.targetId,
      target: row.targetName,
      companyId: row.companyId,
      companyName: row.companyId ? (companyNames.get(row.companyId) ?? null) : null,
      reasonCode: row.reasonCode,
      reason: row.reason,
      highlight: isHighlighted(row.action),
      before: row.before,
      after: row.after,
    })),
  }
}

/** Какие действия вообще встречались — для фильтра. Список берётся
 *  из данных, а не из перечисления в коде: иначе фильтр обещает то,
 *  чего в журнале нет. */
export async function auditActions(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ['action'],
    select: { action: true },
    orderBy: { action: 'asc' },
  })
  return rows.map((row) => row.action)
}

/* --------------------------------------------------------------------------
   Журнал обмена
   -------------------------------------------------------------------------- */

export interface ExchangeRow {
  id: string
  at: string
  service: string
  direction: string
  method: string
  path: string
  operation: string
  subject: string | null
  status: number | null
  durationMs: number
  requestId: string | null
  outcome: string
  errorCode: string | null
  error: string | null
  /** Уже вычищенные сводки: реквизитов, ключей и одноразовых кодов
   *  здесь нет ни в каком виде. */
  request: unknown
  response: unknown
}

export interface ListExchangeQuery {
  service?: string | undefined
  direction?: string | undefined
  outcome?: string | undefined
  requestId?: string | undefined
  search?: string | undefined
  page: number
  pageSize: number
}

export async function listExchange(
  prisma: PrismaClient,
  query: ListExchangeQuery,
): Promise<{ rows: ExchangeRow[]; total: number }> {
  const where: Prisma.ExchangeLogWhereInput = {}
  if (query.service && query.service !== 'all') where.service = query.service
  if (query.direction && query.direction !== 'all') where.direction = query.direction
  if (query.outcome && query.outcome !== 'all') where.outcome = query.outcome
  // Поиск по `requestId` — главный повод открыть этот журнал: именно
  // с ним приходят из «Состояния системы» и из поддержки сервиса.
  if (query.requestId) where.requestId = query.requestId
  if (query.search && query.search.trim() !== '') {
    const search = query.search.trim()
    where.OR = [
      { path: { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
      { requestId: { contains: search, mode: 'insensitive' } },
    ]
  }

  const total = await prisma.exchangeLog.count({ where })
  const rows = await prisma.exchangeLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: query.page * query.pageSize,
    take: query.pageSize,
  })

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      at: row.createdAt.toISOString(),
      service: row.service,
      direction: row.direction,
      method: row.method,
      path: row.path,
      operation: row.operation,
      subject: row.subject,
      status: row.httpStatus,
      durationMs: row.durationMs,
      requestId: row.requestId,
      outcome: row.outcome,
      errorCode: row.errorCode,
      error: row.error,
      request: row.request,
      response: row.response,
    })),
  }
}

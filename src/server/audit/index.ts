/**
 * Журнал аудита: кто из операторов что сделал.
 *
 * Отличается от журнала обмена предметом. Аудит отвечает на вопрос
 * «кто это сделал», журнал обмена — «что ушло наружу и что пришло
 * обратно». Первый читают при разборе с человеком, второй — при
 * разборе с внешним сервисом.
 *
 * Записи **неудаляемы**: это финансовая отчётность. Функции удаления
 * здесь нет и не будет (CLAUDE.md, «Что мы строим»).
 *
 * Действие хранится **кодом**, а не готовым текстом: в текст оно
 * превращается при показе, на языке читателя (правило 3e).
 */

import type { Prisma, PrismaClient } from '@/generated/prisma/client'

/** Клиент или транзакция — запись в аудит должна идти в той же
 *  транзакции, что и само действие, иначе одно из двух потеряется. */
type Db = PrismaClient | Prisma.TransactionClient

/**
 * Действия, которые выделяются в журнале отдельно.
 *
 * Это те, где деньги или доступ появляются не из обычного хода работы:
 * корректировки, выводы, изменения прав, переопределения комиссий,
 * переключение автозачисления, уничтожение адреса, возврат.
 */
export const HIGHLIGHTED_ACTIONS = new Set([
  'BALANCE_ADJUSTED',
  'WITHDRAWN',
  'RIGHTS_CHANGED',
  'FEE_OVERRIDDEN',
  'AUTO_CREDIT_TOGGLED',
  'ADDRESS_BURNED',
  'REFUND_SENT',
  'USER_BLOCKED',
])

export function isHighlighted(action: string): boolean {
  return HIGHLIGHTED_ACTIONS.has(action)
}

export interface AuditInput {
  operatorId: string | null
  /** Код действия: `DEPOSIT_CREDITED`, `CARD_FROZEN`, … */
  action: string
  targetType: 'USER' | 'DEPOSIT' | 'CARD' | 'OPERATOR' | 'SETTINGS' | 'ADDRESS' | 'COMPANY' | 'SESSION' | 'NETWORK'
  targetId: string
  /** Имя объекта на момент действия. Данные, их не переводят. */
  targetName?: string | undefined
  companyId?: string | null | undefined
  reasonCode?: string | undefined
  reason?: string | undefined
  before?: unknown
  after?: unknown
}

export async function writeAudit(db: Db, input: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      operatorId: input.operatorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      targetName: input.targetName ?? null,
      companyId: input.companyId ?? null,
      reasonCode: input.reasonCode ?? null,
      reason: input.reason ?? null,
      before: toJson(input.before),
      after: toJson(input.after),
    },
  })
}

/**
 * Привести снимок к виду, который переживёт запись в JSON.
 *
 * Суммы у нас `bigint`, а `JSON.stringify` на нём бросает. Поэтому
 * они становятся строками — и именно строками, а не числами: число
 * с плавающей точкой над деньгами запрещено даже в снимке для
 * человека (CLAUDE.md, правило 1).
 */
export function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined
  return JSON.parse(
    JSON.stringify(value, (_key, inner: unknown) =>
      typeof inner === 'bigint' ? inner.toString() : inner,
    ),
  ) as Prisma.InputJsonValue
}

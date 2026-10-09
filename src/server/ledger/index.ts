/**
 * Леджер: проводки, записи, баланс.
 *
 * Баланс — это **сумма записей леджера**, а не отдельно хранимое поле.
 * Отдельное поле рано или поздно расходится с проводками, и выяснить,
 * какое из двух чисел правда, уже нельзя. Поэтому прямых
 * `UPDATE balance` в системе нет вовсе (CLAUDE.md, правило 6).
 *
 * Проводки неизменяемы. Ошибка исправляется обратной проводкой, а не
 * правкой записи: история денег не переписывается.
 */

import type { Prisma } from '@/generated/prisma/client'
import type { Minor } from '@/shared/money'
import { EXTERNAL, FEE_INCOME, userAccount, type LedgerSourceType, type LedgerType } from './accounts'

export class LedgerError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'LedgerError'
    this.code = code
  }
}

/** Одна запись проводки: счёт и сумма со знаком. */
export interface EntryInput {
  account: string
  amountMinor: Minor
  currency?: string
}

export interface PostInput {
  type: LedgerType
  companyId: string
  userId?: string
  /** Источник: по паре «тип + id» проводка уникальна. */
  sourceType: LedgerSourceType
  sourceId: string
  operatorId?: string
  reason?: string
  /** Ставка, по которой считали комиссию. Фиксируется в проводке:
   *  изменение глобальной ставки прошлые операции не пересчитывает. */
  feeBpsUsed?: number
  entries: EntryInput[]
}

export interface PostedTransaction {
  id: string
  /** Проводка уже существовала: повтор события или второй запрос по той
   *  же заявке. Вызывающий код должен считать это успехом, а не ошибкой. */
  alreadyExisted: boolean
}

/**
 * Запись проводки.
 *
 * Выполняется внутри переданной транзакции БД: проводка и её записи
 * появляются вместе или не появляются вовсе. Половина проводки — это
 * деньги, взявшиеся из воздуха или исчезнувшие.
 *
 * Идемпотентность держится **двумя** вещами, и обе нужны.
 *
 * 1. Проверка «такая проводка уже есть» — обычный путь. Повторная
 *    доставка события штатна, и ошибкой она быть не должна.
 * 2. Уникальный индекс в базе по источнику — на случай гонки, когда
 *    два запроса прошли проверку одновременно. Тогда второй получит
 *    отказ и его транзакция откатится целиком.
 *
 * Перехватывать этот отказ здесь бессмысленно: Postgres после
 * нарушения ограничения аварийно завершает всю транзакцию, и любой
 * следующий запрос в ней отвечает «transaction is aborted». То есть
 * вытащить уже существующую проводку в том же блоке нельзя. И не надо:
 * откат — безопасный исход, ничего не задвоилось, а повтор вызова
 * увидит проводку проверкой и вернёт её.
 */
export async function post(tx: Prisma.TransactionClient, input: PostInput): Promise<PostedTransaction> {
  assertBalanced(input.entries)

  const existing = await tx.ledgerTransaction.findFirst({
    where: { sourceType: input.sourceType, sourceId: input.sourceId },
    select: { id: true },
  })
  if (existing) return { id: existing.id, alreadyExisted: true }

  const created = await tx.ledgerTransaction.create({
    data: {
      type: input.type,
      companyId: input.companyId,
      userId: input.userId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      operatorId: input.operatorId ?? null,
      reason: input.reason ?? null,
      feeBpsUsed: input.feeBpsUsed ?? null,
      entries: {
        create: input.entries.map((entry) => ({
          account: entry.account,
          amountMinor: entry.amountMinor,
          currency: entry.currency ?? 'USD',
        })),
      },
    },
  })
  return { id: created.id, alreadyExisted: false }
}


/**
 * Сумма записей проводки обязана быть равна нулю.
 *
 * Это и есть двойная запись: деньги не появляются и не исчезают, они
 * перемещаются между счетами. Непарная проводка означает, что где-то
 * потеряна или удвоена сумма, и найти это потом по балансу уже нельзя.
 */
export function assertBalanced(entries: EntryInput[]): void {
  if (entries.length < 2) {
    throw new LedgerError('UNBALANCED', 'В проводке должно быть не меньше двух записей')
  }
  const total = entries.reduce<Minor>((sum, entry) => sum + entry.amountMinor, 0n)
  if (total !== 0n) {
    throw new LedgerError('UNBALANCED', `Сумма записей проводки не равна нулю: ${total}`)
  }
}

/** Баланс счёта — сумма его записей. */
export async function accountBalance(
  tx: Prisma.TransactionClient,
  account: string,
): Promise<Minor> {
  const result = await tx.ledgerEntry.aggregate({
    where: { account },
    _sum: { amountMinor: true },
  })
  return result._sum.amountMinor ?? 0n
}

/** Баланс пользователя. */
export async function userBalance(tx: Prisma.TransactionClient, userId: string): Promise<Minor> {
  return accountBalance(tx, userAccount(userId))
}

/* --------------------------------------------------------------------------
   Заготовки записей под каждый тип проводки.

   Собраны здесь, а не по месту вызова: иначе знак суммы и набор счетов
   пришлось бы помнить в пяти местах, и где-нибудь он оказался бы
   перепутан.
   -------------------------------------------------------------------------- */

/** Пополнение: извне на счёт пользователя, комиссия нам. */
export function depositEntries(userId: string, netMinor: Minor, feeMinor: Minor): EntryInput[] {
  const entries: EntryInput[] = [
    { account: EXTERNAL, amountMinor: -(netMinor + feeMinor) },
    { account: userAccount(userId), amountMinor: netMinor },
  ]
  if (feeMinor !== 0n) entries.push({ account: FEE_INCOME, amountMinor: feeMinor })
  return entries
}

/** Трата: со счёта пользователя наружу. */
export function spendEntries(userId: string, amountMinor: Minor): EntryInput[] {
  return [
    { account: userAccount(userId), amountMinor: -amountMinor },
    { account: EXTERNAL, amountMinor },
  ]
}

/** Возврат по карте: извне на счёт пользователя. */
export function refundEntries(userId: string, amountMinor: Minor): EntryInput[] {
  return [
    { account: EXTERNAL, amountMinor: -amountMinor },
    { account: userAccount(userId), amountMinor },
  ]
}

/** Вывод: со счёта пользователя наружу, комиссия нам. */
export function withdrawalEntries(userId: string, netMinor: Minor, feeMinor: Minor): EntryInput[] {
  const entries: EntryInput[] = [
    { account: userAccount(userId), amountMinor: -(netMinor + feeMinor) },
    { account: EXTERNAL, amountMinor: netMinor },
  ]
  if (feeMinor !== 0n) entries.push({ account: FEE_INCOME, amountMinor: feeMinor })
  return entries
}

/** Ручная корректировка: только с правом и причиной. */
export function adjustmentEntries(userId: string, deltaMinor: Minor): EntryInput[] {
  return [
    { account: userAccount(userId), amountMinor: deltaMinor },
    { account: EXTERNAL, amountMinor: -deltaMinor },
  ]
}

export { EXTERNAL, FEE_INCOME, userAccount }
export type { LedgerSourceType, LedgerType }

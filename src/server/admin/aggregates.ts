/**
 * Сводные запросы для списков админки.
 *
 * Здесь живёт SQL, и это осознанно. Список пользователей обязан
 * работать на тысяче строк, а баланс и остатки по картам — это суммы
 * по двум таблицам. Считать их в цикле по странице значит двадцать
 * запросов на экран, а по всему списку — тысячу; посчитать их одним
 * группирующим запросом можно только запросом.
 *
 * Три правила для всего SQL в этом файле:
 *
 *   1. Суммы приводятся к `::bigint` явно. `SUM()` над `bigint`
 *      в Postgres возвращает `numeric`, драйвер отдаёт его строкой,
 *      и дальше «деньги» уехали бы в текст или, хуже, в число
 *      с плавающей точкой (CLAUDE.md, правило 1).
 *   2. Счётчики приводятся к `::int`: `COUNT(*)` — тоже `bigint`.
 *   3. Параметры подставляются только через `$1`, без склейки строк.
 */

import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import type { Minor } from '@/shared/money'

type Db = PrismaClient | Prisma.TransactionClient

/** Баланс пользователя — сумма записей леджера по его счёту. */
export async function balancesOf(db: Db, userIds: string[]): Promise<Map<string, Minor>> {
  if (userIds.length === 0) return new Map()
  const accounts = userIds.map((id) => `USER:${id}`)
  const rows = await db.$queryRaw<{ account: string; balance: bigint }[]>`
    SELECT account, COALESCE(SUM(amount_minor), 0)::bigint AS balance
      FROM ledger_entries
     WHERE account = ANY(${accounts})
     GROUP BY account
  `
  const result = new Map<string, Minor>()
  for (const id of userIds) result.set(id, 0n)
  for (const row of rows) result.set(row.account.slice('USER:'.length), row.balance)
  return result
}

export interface CardAggregate {
  /** Карты, занимающие слот: всё, кроме отменённых. */
  liveCards: number
  /** Сумма остатков по живым картам: это и есть «доступно к тратам». */
  remaining: Minor
  primaryLast4: string | null
  childLast4: string | null
}

export async function cardAggregatesOf(
  db: Db,
  userIds: string[],
): Promise<Map<string, CardAggregate>> {
  if (userIds.length === 0) return new Map()
  const rows = await db.$queryRaw<
    {
      user_id: string
      live_cards: number
      remaining: bigint
      primary_last4: string | null
      child_last4: string | null
    }[]
  >`
    SELECT user_id,
           COUNT(*) FILTER (WHERE status <> 'CANCELED')::int AS live_cards,
           COALESCE(SUM(applied_limit - settled_minor - pending_minor)
                    FILTER (WHERE status IN ('ACTIVE', 'FROZEN', 'CLOSING')), 0)::bigint AS remaining,
           MAX(last4) FILTER (WHERE is_primary AND status <> 'CANCELED') AS primary_last4,
           MAX(last4) FILTER (WHERE NOT is_primary AND status <> 'CANCELED') AS child_last4
      FROM cards
     WHERE user_id = ANY(${userIds})
     GROUP BY user_id
  `
  const result = new Map<string, CardAggregate>()
  for (const id of userIds) {
    result.set(id, { liveCards: 0, remaining: 0n, primaryLast4: null, childLast4: null })
  }
  for (const row of rows) {
    result.set(row.user_id, {
      liveCards: row.live_cards,
      remaining: row.remaining,
      primaryLast4: row.primary_last4,
      childLast4: row.child_last4,
    })
  }
  return result
}

/**
 * Пользователи с отрицательным балансом.
 *
 * Фильтр по балансу — это фильтр по сумме проводок, и выразить его
 * иначе, чем группирующим запросом, нельзя: отдельного поля «баланс»
 * у нас нет и не будет (CLAUDE.md, правило 6).
 */
export async function negativeBalanceUserIds(db: Db, companyId?: string): Promise<string[]> {
  const rows = companyId
    ? await db.$queryRaw<{ user_id: string }[]>`
        SELECT t.user_id
          FROM ledger_entries e
          JOIN ledger_transactions t ON t.id = e.transaction_id
         WHERE e.account = 'USER:' || t.user_id
           AND t.company_id = ${companyId}
         GROUP BY t.user_id
        HAVING SUM(e.amount_minor) < 0
      `
    : await db.$queryRaw<{ user_id: string }[]>`
        SELECT t.user_id
          FROM ledger_entries e
          JOIN ledger_transactions t ON t.id = e.transaction_id
         WHERE e.account = 'USER:' || t.user_id
         GROUP BY t.user_id
        HAVING SUM(e.amount_minor) < 0
      `
  return rows.map((row) => row.user_id)
}

export interface FeeIncome {
  total: Minor
  fromDeposits: Minor
  fromWithdrawals: Minor
}

/**
 * Выручка с комиссий.
 *
 * Берётся **готовым разрезом** под выбранную компанию, а не
 * складыванием разрезов в коде: это те же деньги, и сумма,
 * посчитанная на экране, разошлась бы с суммой, посчитанной
 * в леджере (`docs/flows-admin.md`, «Выручка»).
 */
export async function feeIncome(
  db: Db,
  range: { from: Date; to: Date; companyId?: string },
): Promise<FeeIncome> {
  const rows = range.companyId
    ? await db.$queryRaw<{ type: string; total: bigint }[]>`
        SELECT t.type, COALESCE(SUM(e.amount_minor), 0)::bigint AS total
          FROM ledger_entries e
          JOIN ledger_transactions t ON t.id = e.transaction_id
         WHERE e.account = 'FEE_INCOME'
           AND t.created_at >= ${range.from}
           AND t.created_at < ${range.to}
           AND t.company_id = ${range.companyId}
         GROUP BY t.type
      `
    : await db.$queryRaw<{ type: string; total: bigint }[]>`
        SELECT t.type, COALESCE(SUM(e.amount_minor), 0)::bigint AS total
          FROM ledger_entries e
          JOIN ledger_transactions t ON t.id = e.transaction_id
         WHERE e.account = 'FEE_INCOME'
           AND t.created_at >= ${range.from}
           AND t.created_at < ${range.to}
         GROUP BY t.type
      `

  const by = new Map(rows.map((row) => [row.type, row.total]))
  const fromDeposits = by.get('DEPOSIT') ?? 0n
  const fromWithdrawals = by.get('WITHDRAWAL') ?? 0n
  const total = [...by.values()].reduce<Minor>((sum, value) => sum + value, 0n)
  return { total, fromDeposits, fromWithdrawals }
}

export interface InflowSlice {
  networkId: string
  name: string
  asset: string
  amount: Minor
}

/**
 * Сколько крипты пришло на наши адреса за период, по сетям.
 *
 * Считается по зачисленным поступлениям: удержанное проверкой на наши
 * счета не попало и в приход не идёт.
 */
export async function inflowByNetwork(
  db: Db,
  range: { from: Date; to: Date; companyId?: string },
): Promise<InflowSlice[]> {
  const rows = range.companyId
    ? await db.$queryRaw<{ network_id: string; name: string; asset: string; amount: bigint }[]>`
        SELECT n.id AS network_id, n.name, n.asset,
               COALESCE(SUM(d.received_minor), 0)::bigint AS amount
          FROM deposit_requests d
          JOIN networks n ON n.id = d.network_id
          JOIN users u ON u.id = d.user_id
         WHERE d.status = 'CREDITED'
           AND d.updated_at >= ${range.from}
           AND d.updated_at < ${range.to}
           AND u.company_id = ${range.companyId}
         GROUP BY n.id, n.name, n.asset
         ORDER BY amount DESC
      `
    : await db.$queryRaw<{ network_id: string; name: string; asset: string; amount: bigint }[]>`
        SELECT n.id AS network_id, n.name, n.asset,
               COALESCE(SUM(d.received_minor), 0)::bigint AS amount
          FROM deposit_requests d
          JOIN networks n ON n.id = d.network_id
         WHERE d.status = 'CREDITED'
           AND d.updated_at >= ${range.from}
           AND d.updated_at < ${range.to}
         GROUP BY n.id, n.name, n.asset
         ORDER BY amount DESC
      `
  return rows.map((row) => ({
    networkId: row.network_id,
    name: row.name,
    asset: row.asset,
    amount: row.amount,
  }))
}

/** Сколько адресов выдано по каждой паре «монета + сеть». */
export async function addressCounts(db: Db): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ network_id: string; count: number }[]>`
    SELECT network_id, COUNT(*)::int AS count
      FROM deposit_addresses
     GROUP BY network_id
  `
  return new Map(rows.map((row) => [row.network_id, row.count]))
}

/** Сколько поступлений пришло на каждый адрес. */
export async function depositCountsByAddress(
  db: Db,
  addressIds: string[],
): Promise<Map<string, { count: number; lastAt: Date | null }>> {
  if (addressIds.length === 0) return new Map()
  const rows = await db.$queryRaw<{ address_id: string; count: number; last_at: Date | null }[]>`
    SELECT address_id, COUNT(*)::int AS count, MAX(created_at) AS last_at
      FROM deposit_requests
     WHERE address_id = ANY(${addressIds})
     GROUP BY address_id
  `
  const result = new Map<string, { count: number; lastAt: Date | null }>()
  for (const id of addressIds) result.set(id, { count: 0, lastAt: null })
  for (const row of rows) result.set(row.address_id, { count: row.count, lastAt: row.last_at })
  return result
}

/**
 * Идентификаторы операций с аномалиями.
 *
 * Сравнение двух колонок одной таблицы (списано против
 * авторизованного) выразимо только запросом. Вытаскиваются
 * идентификаторы, а не строки: отбор потом применяется обычным
 * запросом со всеми остальными условиями и страницами.
 *
 * Аномалий в норме единицы. Предел нужен не ради скорости, а чтобы
 * сломанная интеграция не превратила один отбор в запрос на сто тысяч
 * идентификаторов.
 */
export async function anomalousTransactionIds(db: Db, limit = 5000): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id
      FROM card_transactions
     WHERE force_posted IS TRUE
        OR (status = 'SETTLED' AND type <> 'REFUND' AND authorized_amount IS NULL)
        OR (authorized_amount IS NOT NULL AND amount_minor > authorized_amount)
     ORDER BY occurred_at DESC
     LIMIT ${limit}
  `
  return rows.map((row) => row.id)
}

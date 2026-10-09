/**
 * Выгрузка транзакций в CSV.
 *
 * Отбор берётся из того же адреса, что на экране: оператор обязан
 * получить файл по тому списку, который видит, иначе выгрузка будет
 * обманывать.
 *
 * Предел строк стоит нарочно. Выгрузка за год — это запрос, который
 * держит соединение и память; оператору, которому нужен год, нужен не
 * файл, а сверка.
 */

import { cookies } from 'next/headers'
import { currentOperator } from '@/server/auth'
import { listTransactions, type TransactionFilter } from '@/server/admin/transactions'
import { csvResponse, toCsv } from '@/server/admin/csv'
import { prisma } from '@/server/db/client'
import { ALL_COMPANIES, COMPANY_COOKIE } from '../../constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ROWS = 5000

export async function GET(request: Request): Promise<Response> {
  const operator = await currentOperator()
  if (!operator) return new Response('unauthorized', { status: 401 })

  const url = new URL(request.url)
  const cookieCompany = (await cookies()).get(COMPANY_COOKIE)?.value
  const companyId = !cookieCompany || cookieCompany === ALL_COMPANIES ? undefined : cookieCompany

  const list = await listTransactions(prisma, {
    companyId,
    status: (url.searchParams.get('status') ?? 'all') as TransactionFilter,
    search: url.searchParams.get('q') ?? undefined,
    from: parseDay(url.searchParams.get('from')),
    to: parseDay(url.searchParams.get('to'), 1),
    page: 0,
    pageSize: MAX_ROWS,
  })

  const body = toCsv(
    [
      'Время',
      'Пользователь',
      'Компания',
      'Карта',
      'Мерчант',
      'Сумма',
      'Валюта',
      'Сумма мерчанта',
      'Валюта мерчанта',
      'Состояние',
      'Причина отказа',
      'Аномалия',
      'Идентификатор',
    ],
    list.rows.map((row) => [
      row.at,
      row.userName,
      row.companyName,
      row.cardLast4,
      row.merchant,
      row.amount,
      row.currency,
      row.localAmount,
      row.localCurrency,
      row.display,
      row.declineReason,
      row.anomaly,
      row.id,
    ]),
  )

  return csvResponse('transactions.csv', body)
}

function parseDay(value: string | null, addDays = 0): Date | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + addDays))
}

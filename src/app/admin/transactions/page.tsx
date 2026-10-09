import { cookies } from 'next/headers'
import { requireOperator } from '@/server/auth'
import {
  listTransactions,
  transactionDetail,
  type TransactionFilter,
} from '@/server/admin/transactions'
import { prisma } from '@/server/db/client'
import { ALL_COMPANIES, COMPANY_COOKIE } from '../constants'
import { oneOf, pageFrom } from '../_components/params'
import { TransactionsScreen } from './TransactionsScreen'

const PAGE_SIZE = 25

/**
 * Транзакции платформы.
 *
 * Отбор по периоду читается из адреса: даты приходят строками
 * `ГГГГ-ММ-ДД`, и день «до» берётся включительно — оператор, выбравший
 * один и тот же день с двух сторон, ожидает увидеть этот день, а не
 * пустой список.
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireOperator()
  const params = await searchParams

  const cookieCompany = (await cookies()).get(COMPANY_COOKIE)?.value
  const companyId = !cookieCompany || cookieCompany === ALL_COMPANIES ? undefined : cookieCompany

  const status = (oneOf(params.status) ?? 'all') as TransactionFilter
  const page = pageFrom(params.page)
  const from = parseDay(oneOf(params.from))
  const to = parseDay(oneOf(params.to), 1)

  const list = await listTransactions(prisma, {
    companyId,
    status,
    search: oneOf(params.q),
    userId: oneOf(params.user),
    cardId: oneOf(params.card),
    from,
    to,
    page,
    pageSize: PAGE_SIZE,
  })

  const openId = oneOf(params.open)
  const open = openId ? await transactionDetail(prisma, openId) : null

  return (
    <TransactionsScreen
      rows={list.rows}
      total={list.total}
      page={page}
      pageSize={PAGE_SIZE}
      status={status}
      open={open}
    />
  )
}

/** Дата из адреса. Границы считаются в UTC, как и всё в базе. */
function parseDay(value: string | undefined, addDays = 0): Date | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + addDays),
  )
  return Number.isNaN(date.getTime()) ? undefined : date
}

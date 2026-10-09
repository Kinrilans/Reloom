/**
 * Выгрузка пользователей в CSV.
 *
 * Тот же отбор, что на экране. Реквизитов карт в файле нет и быть не
 * может: оператору чужой номер карты не нужен ни на экране, ни
 * в выгрузке (docs/flows-admin.md).
 */

import { cookies } from 'next/headers'
import { currentOperator } from '@/server/auth'
import { listUsers, type UserFilter } from '@/server/admin/users'
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

  const list = await listUsers(prisma, {
    companyId,
    filter: (url.searchParams.get('filter') ?? 'ACTIVE') as UserFilter,
    search: url.searchParams.get('q') ?? undefined,
    page: 0,
    pageSize: MAX_ROWS,
  })

  const body = toCsv(
    ['Имя', 'Компания', 'Почта', 'Состояние', 'Баланс', 'Карт', 'Статус у эмитента', 'Идентификатор'],
    list.rows.map((row) => [
      row.name,
      row.companyName,
      row.email,
      row.status,
      row.balance,
      row.cards,
      row.oxenStatus,
      row.id,
    ]),
  )

  return csvResponse('users.csv', body)
}

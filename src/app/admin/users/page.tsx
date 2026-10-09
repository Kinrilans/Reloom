import { cookies } from 'next/headers'
import { requireOperator } from '@/server/auth'
import { listUsers, userCard, type UserFilter } from '@/server/admin/users'
import { prisma } from '@/server/db/client'
import { readSettings } from '@/server/services/settings'
import { ALL_COMPANIES, COMPANY_COOKIE } from '../constants'
import { oneOf, pageFrom } from '../_components/params'
import { UsersScreen } from './UsersScreen'

const PAGE_SIZE = 20

/**
 * Пользователи.
 *
 * По умолчанию показываются только активные. Заблокированные — через
 * фильтр и помечены в списке явно: оператор не должен принять
 * заблокированного за действующего.
 *
 * Отбор, поиск и страницы считаются в базе: список обязан работать
 * на тысяче строк.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireOperator()
  const params = await searchParams

  const cookieCompany = (await cookies()).get(COMPANY_COOKIE)?.value
  const companyId = !cookieCompany || cookieCompany === ALL_COMPANIES ? undefined : cookieCompany

  const openId = oneOf(params.open)
  // Ссылка с открытой карточкой приходит и с других экранов. Если
  // открываемый пользователь не попадает под текущий отбор, карточка
  // всё равно должна открыться — поэтому она читается отдельно.
  const filter = (oneOf(params.filter) ?? 'ACTIVE') as UserFilter
  const page = pageFrom(params.page)

  const list = await listUsers(prisma, {
    companyId,
    filter,
    search: oneOf(params.q),
    page,
    pageSize: PAGE_SIZE,
  })

  const open = openId ? await userCard(prisma, openId) : null
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  const settings = await readSettings(prisma)

  return (
    <UsersScreen
      rows={list.rows}
      total={list.total}
      page={page}
      pageSize={PAGE_SIZE}
      filter={filter}
      open={open}
      companies={companies}
      globalFees={{
        depositBps: settings.depositFeeBps,
        withdrawalBps: settings.withdrawalFeeBps,
      }}
    />
  )
}

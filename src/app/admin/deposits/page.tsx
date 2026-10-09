import { cookies } from 'next/headers'
import { requireOperator } from '@/server/auth'
import { depositDetail, listDeposits, type DepositFilter } from '@/server/admin/deposits'
import { prisma } from '@/server/db/client'
import { readSettings } from '@/server/services/settings'
import { ALL_COMPANIES, COMPANY_COOKIE } from '../constants'
import { oneOf, pageFrom } from '../_components/params'
import { DepositsScreen } from './DepositsScreen'

const PAGE_SIZE = 10

/**
 * Пополнения.
 *
 * Экран меняет смысл от настройки автозачисления: включено — это
 * история зачислений, выключено — очередь решений. Поэтому и фильтр
 * по умолчанию разный: показывать пустой экран «заявок нет», когда за
 * день система зачислила сотни поступлений, бессмысленно.
 *
 * Отбор и страница читаются из адреса, а запрос идёт в базу: очередь
 * за месяц — это тысячи строк, и «загрузить всё и отфильтровать
 * в памяти» здесь не работает.
 */
export default async function DepositsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireOperator()
  const params = await searchParams

  const cookieCompany = (await cookies()).get(COMPANY_COOKIE)?.value
  const companyId = !cookieCompany || cookieCompany === ALL_COMPANIES ? undefined : cookieCompany

  const settings = await readSettings(prisma)
  const manual = !settings.autoCreditOn
  const filter = (oneOf(params.status) ?? (manual ? 'queue' : 'all')) as DepositFilter

  const list = await listDeposits(prisma, {
    companyId,
    filter,
    search: oneOf(params.q),
    page: pageFrom(params.page),
    pageSize: PAGE_SIZE,
  })

  const openId = oneOf(params.open)
  const open = openId ? await depositDetail(prisma, openId) : null

  return (
    <DepositsScreen
      manual={manual}
      filter={filter}
      rows={list.rows}
      total={list.total}
      pageSize={PAGE_SIZE}
      page={pageFrom(params.page)}
      open={open}
      amlMaxRisk={settings.amlMaxRisk}
    />
  )
}

import { cookies } from 'next/headers'
import { requireOperator } from '@/server/auth'
import { cardDetail, listCards, type CardFilter, type CardKind } from '@/server/admin/cards'
import { prisma } from '@/server/db/client'
import { ALL_COMPANIES, COMPANY_COOKIE } from '../constants'
import { oneOf, pageFrom } from '../_components/params'
import { CardsScreen } from './CardsScreen'

const PAGE_SIZE = 20

/**
 * Сводный список карт.
 *
 * Потолок, потраченное и остаток стоят рядом: потолок не уменьшается
 * при тратах, и один потолок без остатка оператор прочтёт как
 * «доступно» и ошибётся на всю сумму трат.
 */
export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireOperator()
  const params = await searchParams

  const cookieCompany = (await cookies()).get(COMPANY_COOKIE)?.value
  const companyId = !cookieCompany || cookieCompany === ALL_COMPANIES ? undefined : cookieCompany

  const status = (oneOf(params.status) ?? 'all') as CardFilter
  const kind = (oneOf(params.kind) ?? 'all') as CardKind
  const page = pageFrom(params.page)

  const list = await listCards(prisma, {
    companyId,
    status,
    kind,
    search: oneOf(params.q),
    page,
    pageSize: PAGE_SIZE,
  })

  const openId = oneOf(params.open)
  const open = openId ? await cardDetail(prisma, openId) : null

  return (
    <CardsScreen
      rows={list.rows}
      total={list.total}
      page={page}
      pageSize={PAGE_SIZE}
      status={status}
      kind={kind}
      open={open}
    />
  )
}

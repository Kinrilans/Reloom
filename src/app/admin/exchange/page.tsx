import { requireOperator } from '@/server/auth'
import { listExchange } from '@/server/admin/journals'
import { prisma } from '@/server/db/client'
import { oneOf, pageFrom } from '../_components/params'
import { ExchangeScreen } from './ExchangeScreen'

const PAGE_SIZE = 20

/**
 * Журнал обмена.
 *
 * Сюда приходят из «Состояния системы» со ссылкой `?request=req_…`:
 * разбор должен начинаться с нужной строки, а не с её поиска руками.
 */
export default async function ExchangePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireOperator()
  const params = await searchParams
  const page = pageFrom(params.page)

  const list = await listExchange(prisma, {
    service: oneOf(params.service),
    direction: oneOf(params.direction),
    outcome: oneOf(params.outcome),
    requestId: oneOf(params.request),
    search: oneOf(params.q),
    page,
    pageSize: PAGE_SIZE,
  })

  const openId = oneOf(params.open)
  const open = openId ? (list.rows.find((row) => row.id === openId) ?? null) : null

  return (
    <ExchangeScreen
      rows={list.rows}
      total={list.total}
      page={page}
      pageSize={PAGE_SIZE}
      open={open}
    />
  )
}

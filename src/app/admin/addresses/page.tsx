import { cookies } from 'next/headers'
import { requireOperator } from '@/server/auth'
import { listAddresses, type AddressFilter } from '@/server/admin/addresses'
import { prisma } from '@/server/db/client'
import { ALL_COMPANIES, COMPANY_COOKIE } from '../constants'
import { oneOf, pageFrom } from '../_components/params'
import { AddressesScreen } from './AddressesScreen'

const PAGE_SIZE = 12

/**
 * Реестр крипто-адресов.
 *
 * Оператор адреса не заводит: их заводит себе пользователь, и адрес
 * закрепляется за ним — иначе по поступлению не отличить, чей платёж.
 * Оператору нужно другое: найти адрес, увидеть, что на него приходило,
 * и в крайнем случае уничтожить.
 */
export default async function AddressesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireOperator()
  const params = await searchParams

  const cookieCompany = (await cookies()).get(COMPANY_COOKIE)?.value
  const companyId = !cookieCompany || cookieCompany === ALL_COMPANIES ? undefined : cookieCompany

  const status = (oneOf(params.status) ?? 'ACTIVE') as AddressFilter
  const page = pageFrom(params.page)

  const list = await listAddresses(prisma, {
    companyId,
    status,
    networkId: oneOf(params.network),
    search: oneOf(params.q),
    page,
    pageSize: PAGE_SIZE,
  })

  const networks = await prisma.network.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, asset: true, iconUrl: true },
  })

  return (
    <AddressesScreen
      rows={list.rows}
      total={list.total}
      page={page}
      pageSize={PAGE_SIZE}
      status={status}
      networks={networks}
    />
  )
}

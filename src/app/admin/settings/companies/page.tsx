import { requireOperator } from '@/server/auth'
import { companiesView } from '@/server/admin/settings'
import { prisma } from '@/server/db/client'
import { CompaniesScreen } from './CompaniesScreen'

/**
 * Компании холдинга.
 *
 * Название и `cl_…` правятся: эмитент меняет ключи, а компанию
 * переименовывают. Пул, покрытие и депозитный адрес — только чтение:
 * они приходят от эмитента и руками не задаются.
 */
export default async function CompaniesPage() {
  await requireOperator()
  const companies = await companiesView(prisma)
  return <CompaniesScreen companies={companies} />
}

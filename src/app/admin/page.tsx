import { cookies } from 'next/headers'
import { requireOperator } from '@/server/auth'
import { dashboard } from '@/server/admin/dashboard'
import { prisma } from '@/server/db/client'
import { ALL_COMPANIES, COMPANY_COOKIE } from './constants'
import { DashboardScreen } from './DashboardScreen'

/**
 * Дашборд.
 *
 * Серверный компонент: данные читаются здесь, разметка — в клиентском
 * `DashboardScreen`. Разделение нужно потому, что переводы живут
 * в клиентском модуле, а запросы к базе — только на сервере.
 *
 * Все суммы приходят в разметку **готовыми строками**: `bigint` через
 * границу серверного компонента не проходит, и отдать их числом
 * значило бы превратить деньги в `number` (CLAUDE.md, правило 1).
 */
export default async function DashboardPage() {
  await requireOperator()

  const cookieCompany = (await cookies()).get(COMPANY_COOKIE)?.value
  const companyId = !cookieCompany || cookieCompany === ALL_COMPANIES ? undefined : cookieCompany

  const data = await dashboard(prisma, { companyId })
  return <DashboardScreen data={data} />
}

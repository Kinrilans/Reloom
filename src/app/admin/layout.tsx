import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { currentOperator, effectiveRights } from '@/server/auth'
import { prisma } from '@/server/db/client'
import { companyOptions } from '@/server/admin/users'
import { QUEUE_STATUSES } from '@/server/admin/deposits'
import { COMPANY_COOKIE } from './constants'
import { AdminProviders } from './AdminProviders'
import { ALL_COMPANIES } from './constants'

export const metadata: Metadata = {
  title: 'Reloom — админка',
}

/**
 * Раскладка админки.
 *
 * Здесь читается сессия — но **доступ проверяется не здесь**.
 * Раскладка в App Router не перерисовывается при переходах между
 * своими страницами, поэтому проверка в ней пропустила бы уход
 * со страницы на страницу. Каждый защищённый экран вызывает
 * `requireOperator()` первой строкой.
 *
 * Экран входа живёт под этой же раскладкой, поэтому отсутствие
 * оператора — штатное состояние, а не ошибка.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const operator = await currentOperator()
  if (!operator) {
    return <AdminProviders operator={null}>{children}</AdminProviders>
  }

  const companies = await companyOptions(prisma)
  const cookieCompany = (await cookies()).get(COMPANY_COOKIE)?.value
  // Компания из cookie могла быть удалена или отключена — тогда
  // возвращаемся в сводный режим, а не показываем пустые списки
  // под именем, которого больше нет.
  const companyId =
    cookieCompany && companies.some((company) => company.id === cookieCompany)
      ? cookieCompany
      : ALL_COMPANIES

  const queueSize = await prisma.depositRequest.count({
    where: {
      status: { in: QUEUE_STATUSES },
      ...(companyId === ALL_COMPANIES ? {} : { user: { companyId } }),
    },
  })

  return (
    <AdminProviders
      operator={{
        id: operator.id,
        name: operator.fullName,
        email: operator.email,
        rights: effectiveRights(operator),
        isSuperAdmin: operator.isSuperAdmin,
        twoFactorEnabled: true,
        locale: operator.locale,
      }}
      companies={companies}
      companyId={companyId}
      queueSize={queueSize}
    >
      {children}
    </AdminProviders>
  )
}

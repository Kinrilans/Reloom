'use client'

import type { ReactNode } from 'react'
import { I18nProvider, PROTOTYPE_LOCALE } from '@/i18n'
import { AdminStoreProvider, type AdminCompany, type AdminOperator } from './_store/AdminStore'

/**
 * Язык админки по умолчанию — русский (docs/i18n.md), в отличие от
 * клиентской части, где язык продукта английский.
 *
 * Оператор без сессии — это экран входа: переводы ему нужны, а
 * хранилище админки нет, и собирать его из пустого оператора значило
 * бы заводить фальшивого.
 */
export function AdminProviders({
  children,
  operator,
  companies = [],
  companyId = 'all',
  queueSize = 0,
}: {
  children: ReactNode
  operator: AdminOperator | null
  companies?: AdminCompany[]
  companyId?: string
  queueSize?: number
}) {
  if (!operator) {
    return <I18nProvider initialLocale={PROTOTYPE_LOCALE}>{children}</I18nProvider>
  }

  return (
    <I18nProvider initialLocale={operator.locale === 'en' ? 'en' : PROTOTYPE_LOCALE}>
      <AdminStoreProvider
        operator={operator}
        companies={companies}
        companyId={companyId}
        queueSize={queueSize}
      >
        {children}
      </AdminStoreProvider>
    </I18nProvider>
  )
}

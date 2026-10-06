'use client'

import type { ReactNode } from 'react'
import { I18nProvider, PROTOTYPE_LOCALE } from '@/i18n'
import { AdminStoreProvider } from '@/fixtures/adminStore'
import { AdminDemoPanel } from '@/demo/AdminDemoPanel'

/**
 * Язык админки по умолчанию — русский (docs/i18n.md), в отличие от
 * клиентской части, где дефолт продукта английский. На время показа
 * прототипа русский и там, и там.
 */
export function AdminProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider initialLocale={PROTOTYPE_LOCALE}>
      <AdminStoreProvider>
        {children}
        {/* Панель показа (П3). Скрытая: вызывается сочетанием клавиш,
            на телефоне — тройным нажатием на логотип. */}
        <AdminDemoPanel />
      </AdminStoreProvider>
    </I18nProvider>
  )
}

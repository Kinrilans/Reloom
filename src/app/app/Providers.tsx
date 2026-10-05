'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { I18nProvider, PROTOTYPE_LOCALE } from '@/i18n'
import type { Locale } from '@/i18n'
import { StoreProvider } from '@/fixtures/store'

/** То немногое, что нам нужно от Telegram Mini App. Полного SDK в прототипе
 *  нет: настоящей авторизации и initData здесь тоже нет. */
interface TelegramWebApp {
  colorScheme?: 'light' | 'dark'
  ready?: () => void
  expand?: () => void
  onEvent?: (event: string, handler: () => void) => void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

/**
 * Внутри Telegram подхватываем тему клиента, а не навязываем свою
 * (docs/prototype.md). Подхватывается именно светлая или тёмная схема:
 * фирменные цвета остаются нашими, иначе от бренда ничего не останется.
 *
 * Вне Telegram ничего не делаем — работает выбор, сохранённый на витрине.
 */
function useTelegramTheme() {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return

    webApp.ready?.()
    webApp.expand?.()

    const apply = () => {
      const scheme = webApp.colorScheme
      if (scheme === 'light' || scheme === 'dark') {
        document.documentElement.dataset.theme = scheme
      }
    }

    apply()
    webApp.onEvent?.('themeChanged', apply)
  }, [])
}

export function Providers({ children, locale }: { children: ReactNode; locale?: Locale }) {
  useTelegramTheme()
  return (
    <I18nProvider initialLocale={locale ?? PROTOTYPE_LOCALE}>
      <StoreProvider>{children}</StoreProvider>
    </I18nProvider>
  )
}

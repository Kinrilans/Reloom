'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeft, CreditCard, Receipt, Settings } from 'lucide-react'
import { Button } from '@/ui'
import { useT } from '@/i18n'
import styles from './AppShell.module.css'

const NAV = [
  { href: '/app', labelKey: 'nav.home', icon: CreditCard },
  { href: '/app/history', labelKey: 'nav.history', icon: Receipt },
  /* На «Настройках» висит тихий вызов панели показа: три быстрых нажатия.
     Нужен для телефона, где клавиатуры нет (src/demo/useDemoPanel.ts).
     Место выбрано нарочно неслучайным — промахнуться тремя подряд
     попаданиями именно сюда почти невозможно. */
  { href: '/app/settings', labelKey: 'nav.settings', icon: Settings, demoTrigger: true },
]

export interface AppShellProps {
  title?: string
  /** Кнопка «Назад» в шапке. Внутри Telegram дублирует системную. */
  back?: boolean
  /** Нижняя навигация: на корневых экранах есть, на шагах мастеров нет. */
  nav?: boolean
  action?: ReactNode
  children: ReactNode
}

export function AppShell({ title, back = false, nav = false, action, children }: AppShellProps) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()

  return (
    <div className={styles.viewport}>
      <div className={styles.frame}>
        {back || title || action ? (
          <header className={styles.header}>
            {back ? (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={t('common.back')}
                onClick={() => router.back()}
                iconStart={<ChevronLeft size={20} />}
              />
            ) : null}
            {title ? <div className={styles.headerTitle}>{title}</div> : <div className={styles.headerSpacer} />}
            {action ? <div className={styles.headerAction}>{action}</div> : null}
          </header>
        ) : null}

        <main className={[styles.content, nav ? styles.withNav : null].filter(Boolean).join(' ')}>
          {children}
        </main>

        {nav ? (
          <nav className={styles.nav}>
            {NAV.map((item) => {
              const active = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[styles.navItem, active ? styles.navActive : null]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={active ? 'page' : undefined}
                  data-demo-trigger={item.demoTrigger ? '' : undefined}
                >
                  <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {t(item.labelKey)}
                </Link>
              )
            })}
          </nav>
        ) : null}
      </div>
    </div>
  )
}

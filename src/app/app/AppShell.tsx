'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Bell, ChevronLeft, CreditCard, Receipt, Settings } from 'lucide-react'
import { Button } from '@/ui'
import { useT } from '@/i18n'
import styles from './AppShell.module.css'

const NAV = [
  { href: '/app', labelKey: 'nav.home', icon: CreditCard },
  { href: '/app/history', labelKey: 'nav.history', icon: Receipt },
  { href: '/app/notifications', labelKey: 'nav.notifications', icon: Bell },
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
  /** Куда ведёт «Назад». По умолчанию — в историю браузера. Мастер из
   *  нескольких шагов на одном адресе передаёт свой обработчик: иначе
   *  кнопка уводит с экрана целиком, а человек ждал предыдущий шаг. */
  onBack?: () => void
  /** Нижняя навигация: на корневых экранах есть, на шагах мастеров нет. */
  nav?: boolean
  action?: ReactNode
  children: ReactNode
}

/**
 * Оболочка клиентской части.
 *
 * На вкладках шапки нет вовсе: место на телефоне дорогое, а показывать
 * в ней было нечего — название экрана и так стоит заголовком в полотне.
 * «Глазик», который прятал суммы, переехал на главную, в строку счёта:
 * он относится к суммам, а не к приложению целиком.
 *
 * Шапка остаётся только на шагах мастеров: там нужна кнопка «Назад»
 * и название того, что человек сейчас делает.
 */
export function AppShell({
  title,
  back = false,
  onBack,
  nav = false,
  action,
  children,
}: AppShellProps) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()

  const hasHeader = !nav && (back || title || action)

  return (
    <div className={styles.viewport}>
      <div className={styles.frame}>
        {hasHeader ? (
          <header className={styles.header}>
            {back ? (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={t('common.back')}
                onClick={() => (onBack ? onBack() : router.back())}
                iconStart={<ChevronLeft size={20} />}
              />
            ) : null}
            {title ? <div className={styles.headerTitle}>{title}</div> : <div className={styles.headerSpacer} />}
            {action ? <div className={styles.headerAction}>{action}</div> : null}
          </header>
        ) : null}

        <main
          className={[
            styles.content,
            /* Без шапки полотно начинается от самой кромки экрана —
               отступ и безопасную зону добавляем здесь. */
            hasHeader ? null : styles.topSafe,
            nav ? styles.withNav : null,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {/* Название вкладки — заголовком в полотне, а не в шапке:
              шапки на вкладках нет. */}
          {nav && title ? <h1 className={styles.screenTitle}>{title}</h1> : null}
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

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDownToLine,
  Building2,
  ChevronRight,
  CreditCard,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Percent,
  Radio,
  Receipt,
  ScrollText,
  Search,
  Users,
  Wallet,
} from 'lucide-react'
import { Button, Input, Logo, Modal, Select, ThemeToggle } from '@/ui'
import type { SelectOption } from '@/ui'
import { useI18n } from '@/i18n'
import { ALL_COMPANIES, useAdmin } from './_store/AdminStore'
import { signOutAction } from './actions'
import { ProfileModal } from './_components/ProfileModal'
import styles from './AdminShell.module.css'

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  count?: number
}

interface NavGroup {
  title: string
  items: NavItem[]
}

export interface AdminShellProps {
  title: string
  note?: string
  /** Хлебные крошки: раздел, из которого пришли. */
  parent?: { href: string; label: string }
  action?: ReactNode
  children: ReactNode
}

export function AdminShell({ title, note, parent, action, children }: AdminShellProps) {
  const pathname = usePathname()
  const { t } = useI18n()
  const { companyId, setCompanyId, companies, operator, queueSize } = useAdmin()

  // На узком экране меню выезжает поверх содержимого: админка десктопная,
  // и одиннадцать пунктов сверху увели бы работу за пределы экрана.
  const [menuOpen, setMenuOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  // Переход закрывает меню: иначе на телефоне после выбора раздела
  // остаёшься смотреть на то же меню.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const groups: NavGroup[] = [
    {
      title: t('admin.nav.group.work'),
      items: [
        { href: '/admin', label: t('admin.nav.dashboard'), icon: LayoutDashboard },
        // Основная ежедневная работа — счётчик показывает очередь.
        {
          href: '/admin/deposits',
          label: t('admin.nav.deposits'),
          icon: ArrowDownToLine,
          // Счётчик показывает очередь, а не всю историю: в истории
          // число ничего не значит и только мешает заметить рост
          // очереди.
          count: queueSize,
        },
        /* Адреса стоят рядом с пополнениями, а не в настройках: это не
           настройка, а рабочие данные — оператор открывает их, когда
           разбирает поступление. */
        { href: '/admin/addresses', label: t('admin.nav.addresses'), icon: Wallet },
        { href: '/admin/users', label: t('admin.nav.users'), icon: Users },
        { href: '/admin/cards', label: t('admin.nav.cards'), icon: CreditCard },
        { href: '/admin/transactions', label: t('admin.nav.transactions'), icon: Receipt },
      ],
    },
    {
      title: t('admin.nav.group.settings'),
      items: [
        { href: '/admin/settings/fees', label: t('admin.nav.fees'), icon: Percent },
        { href: '/admin/settings/networks', label: t('admin.nav.networks'), icon: Network },
        { href: '/admin/settings/operators', label: t('admin.nav.operators'), icon: KeyRound },
        { href: '/admin/settings/companies', label: t('admin.nav.companies'), icon: Building2 },
      ],
    },
    {
      title: t('admin.nav.group.service'),
      items: [
        { href: '/admin/system', label: t('admin.nav.system'), icon: Gauge },
        { href: '/admin/exchange', label: t('admin.nav.exchange'), icon: Radio },
        { href: '/admin/audit', label: t('admin.nav.audit'), icon: ScrollText },
      ],
    },
  ]

  const companyOptions: SelectOption[] = [
    { value: ALL_COMPANIES, label: t('admin.shell.allCompanies') },
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ]

  const initials = operator.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

  return (
    <div className={styles.layout}>
      {menuOpen ? (
        <div className={styles.scrim} onClick={() => setMenuOpen(false)} aria-hidden />
      ) : null}

      <aside
        id="admin-nav"
        className={[styles.sidebar, menuOpen ? styles.sidebarOpen : null]
          .filter(Boolean)
          .join(' ')}
      >
        <Link className={styles.brand} href="/admin">
          <Logo variant="lockup" tone="current" height={20} title="Reloom" />
        </Link>

        {/* Имя и кружок открывают профиль: язык, второй фактор, свой
            пароль. Там же они и ожидаются. */}
        <button
          type="button"
          className={styles.operator}
          onClick={() => setProfileOpen(true)}
          aria-haspopup="dialog"
        >
          <span className={styles.operatorAvatar}>{initials}</span>
          <span className={styles.operatorBody}>
            <span className={styles.operatorName}>{operator.name}</span>
            <span className={styles.operatorRole}>{t('admin.shell.profileLink')}</span>
          </span>
          <ChevronRight className={styles.operatorChevron} size={16} aria-hidden />
        </button>

        {groups.map((group) => (
          <nav className={styles.navGroup} key={group.title}>
            <span className={styles.navGroupTitle}>{group.title}</span>
            {group.items.map((item) => {
              const active =
                item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[styles.navItem, active ? styles.navActive : null]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={18} strokeWidth={1.75} aria-hidden />
                  {item.label}
                  {item.count ? <span className={styles.navCount}>{item.count}</span> : null}
                </Link>
              )
            })}
          </nav>
        ))}

        {/* Выход внизу панели: действие редкое, и место под ним привычное. */}
        <button type="button" className={styles.signOut} onClick={() => setLeaving(true)}>
          <LogOut size={18} strokeWidth={1.75} aria-hidden />
          {t('admin.shell.signOut')}
        </button>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          {/* Обёртка, а не класс на кнопке: показом управляет медиазапрос,
              и своё display кнопка задаёт сама — два правила на одном узле
              разошлись бы по порядку подключения стилей. */}
          <span className={styles.menuButton}>
            <Button
              variant="ghost"
              iconOnly
              aria-label={t('admin.shell.menu')}
              aria-expanded={menuOpen}
              aria-controls="admin-nav"
              iconStart={<Menu size={20} />}
              onClick={() => setMenuOpen(true)}
            />
          </span>

          <div className={styles.crumbs}>
            {parent ? (
              <>
                <Link href={parent.href}>{parent.label}</Link>
                <ChevronRight size={14} aria-hidden />
              </>
            ) : null}
            <span className={styles.crumbCurrent}>{title}</span>
          </div>

          <div className={styles.search}>
            <Input placeholder={t('admin.shell.search')} iconStart={<Search size={16} />} />
          </div>

          <div className={styles.topbarActions}>
            {/* Компания видна всегда: в сводном режиме каждая строка несёт
                название компании, оператор не должен гадать, чьи это деньги. */}
            <div className={styles.switcher}>
              <Select options={companyOptions} value={companyId} onChange={setCompanyId} />
            </div>
            {/* Язык переехал в профиль: его настраивают один раз, а место
                в шапке он занимал постоянно. Тема остаётся — её переключают
                по освещению, а не по разу. */}
            <ThemeToggle />
          </div>
        </header>

        <main className={styles.content}>
          <div className={styles.pageHead}>
            <div>
              <h1 className={styles.pageTitle}>{title}</h1>
              {note ? <p className={styles.pageNote}>{note}</p> : null}
            </div>
            {action}
          </div>
          {children}
        </main>
      </div>

      <Modal
        open={leaving}
        onClose={() => setLeaving(false)}
        title={t('admin.shell.signOutTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaving(false)}>
              {t('admin.shell.signOutStay')}
            </Button>
            <Button
              onClick={() => {
                setLeaving(false)
                // Сессия отзывается на сервере: уход со страницы её
                // не закрывает, а открытая вкладка продолжала бы
                // работать.
                void signOutAction()
              }}
            >
              {t('admin.shell.signOut')}
            </Button>
          </>
        }
      >
        <p>{t('admin.shell.signOutText')}</p>
      </Modal>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  )
}

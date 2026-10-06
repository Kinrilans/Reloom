'use client'

import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  Clock,
  ShieldAlert,
  TrendingDown,
  UserX,
} from 'lucide-react'
import { Amount, Badge, Card, CardHeader } from '@/ui'
import type { BadgeTone } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import {
  CLOSING_CARDS,
  COMPANIES,
  DEPOSITS,
  NEGATIVE_USERS,
  STUCK_USERS,
  SYSTEM,
} from '@/fixtures/admin'
import type { Company, CoverageState } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from './AdminShell'
import styles from './admin.module.css'

/** Пороги уведомления из docs/flows-admin.md. Состояние приходит готовым
 *  из демо-данных: сравнивать проценты здесь — значит считать. */
const COVERAGE: Record<CoverageState, BadgeTone> = {
  ok: 'success',
  warn20: 'warning',
  warn15: 'warning',
  urgent10: 'danger',
  critical: 'danger',
}

function PoolCard({ company }: { company: Company }) {
  const { t } = useI18n()
  const tone = COVERAGE[company.coverageState]
  return (
    <Card density="dense">
      <div className={styles.kpiLabel}>
        {company.name}
        <Badge tone={tone} solid={company.coverageState === 'critical'}>
          {t(`admin.coverage.${company.coverageState}.label`)}
        </Badge>
      </div>

      <Amount value={company.coverage} currency="%" size="kpi" />

      <div className={styles.kpiRows}>
        <div className={styles.kpiRow}>
          <span className={styles.kpiRowLabel}>{t('admin.dashboard.pool')}</span>
          <Amount value={company.pool} currency="USD" size="caption" />
        </div>
        <div className={styles.kpiRow}>
          <span className={styles.kpiRowLabel}>{t('admin.dashboard.issued')}</span>
          <Amount value={company.issued} currency="USD" size="caption" />
        </div>
        <div className={styles.kpiRow}>
          <span className={styles.kpiRowLabel}>{t('admin.dashboard.headroom')}</span>
          <Amount value={company.headroom} currency="USD" size="caption" />
        </div>
      </div>

      <p className={styles.kpiHint}>{t(`admin.coverage.${company.coverageState}.hint`)}</p>
    </Card>
  )
}

interface QueueRow {
  href: string
  icon: typeof ArrowDownToLine
  title: string
  meta: string
  count: number
}

export default function DashboardPage() {
  const { locale, t } = useI18n()
  const { byCompany, isAllCompanies, companyId } = useAdmin()

  const companies = isAllCompanies ? COMPANIES : COMPANIES.filter((c) => c.id === companyId)
  const deposits = byCompany(DEPOSITS)
  const negative = byCompany(NEGATIVE_USERS)
  const stuck = byCompany(STUCK_USERS)
  const closing = byCompany(CLOSING_CARDS)

  const oldest = deposits[0]

  const queue: QueueRow[] = [
    {
      href: '/admin/deposits',
      icon: ArrowDownToLine,
      title: t('admin.dashboard.queue.deposits'),
      meta: oldest
        ? t('admin.dashboard.queue.depositsMeta', { date: formatDateTime(locale, oldest.createdAt) })
        : t('admin.dashboard.queue.depositsEmpty'),
      count: deposits.length,
    },
    {
      href: '/admin/users?filter=negative',
      icon: TrendingDown,
      title: t('admin.dashboard.queue.negative'),
      meta: t('admin.dashboard.queue.negativeMeta'),
      count: negative.length,
    },
    {
      href: '/admin/system',
      icon: ArrowLeftRight,
      title: t('admin.dashboard.queue.transfers'),
      meta: t('admin.dashboard.queue.transfersMeta'),
      count: SYSTEM.pendingTransfers.length,
    },
    {
      href: '/admin/users?filter=stuck',
      icon: UserX,
      title: t('admin.dashboard.queue.stuck'),
      meta: t('admin.dashboard.queue.stuckMeta'),
      count: stuck.length,
    },
    {
      href: '/admin/cards?filter=closing',
      icon: Clock,
      title: t('admin.dashboard.queue.closing'),
      meta: t('admin.dashboard.queue.closingMeta'),
      count: closing.length,
    },
    {
      href: '/admin/system',
      icon: ShieldAlert,
      title: t('admin.dashboard.queue.errors'),
      meta: t('admin.dashboard.queue.errorsMeta'),
      count: SYSTEM.errors.length,
    },
    {
      href: '/admin/audit',
      icon: AlertTriangle,
      title: t('admin.dashboard.queue.telegram'),
      meta: t('admin.dashboard.queue.telegramMeta'),
      count: 1,
    },
  ]

  return (
    <AdminShell
      title={t('admin.dashboard.title')}
      note={t('admin.dashboard.note')}
    >
      <div className={styles.grid4}>
        {companies.map((company) => (
          <PoolCard key={company.id} company={company} />
        ))}
      </div>

      <div className={styles.split}>
        <Card density="dense">
          <CardHeader
            title={t('admin.dashboard.queue.title')}
            subtitle={t('admin.dashboard.queue.subtitle')}
          />
          <div>
            {queue.map((row) => {
              const Icon = row.icon
              return (
                <Link className={styles.queueItem} href={row.href} key={row.title}>
                  <Icon className={styles.queueIcon} size={18} aria-hidden />
                  <span className={styles.queueBody}>
                    <span className={styles.queueTitle}>{row.title}</span>
                    <span className={styles.queueMeta}>{row.meta}</span>
                  </span>
                  <span className={styles.queueCount}>{row.count}</span>
                </Link>
              )
            })}
          </div>
        </Card>

        <Card density="dense">
          <CardHeader title={t('admin.dashboard.health')} />
          <div className={styles.rows}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t('admin.dashboard.lag')}</span>
              <span className={styles.rowValue}>{t('admin.seconds', { value: SYSTEM.eventLagSeconds })}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t('admin.dashboard.unprocessed')}</span>
              <span className={styles.rowValue}>{SYSTEM.unprocessedEvents}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t('admin.dashboard.lastPoolRead')}</span>
              <span className={styles.rowValue}>{formatDateTime(locale, SYSTEM.lastPoolRead)}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t('admin.dashboard.throttling')}</span>
              <span className={styles.rowValue}>
                {SYSTEM.throttling ? (
                  <Badge tone="danger">{t('admin.dashboard.throttlingOn')}</Badge>
                ) : (
                  <Badge tone="success">{t('admin.dashboard.throttlingOff')}</Badge>
                )}
              </span>
            </div>
          </div>

          <p className={styles.kpiHint}>{t('admin.dashboard.catchUpHint')}</p>

          <div className={styles.kpiRows}>
            <Link className={styles.queueItem} href="/admin/system">
              <Activity className={styles.queueIcon} size={18} aria-hidden />
              <span className={styles.queueBody}>
                <span className={styles.queueTitle}>{t('admin.dashboard.systemLink')}</span>
                <span className={styles.queueMeta}>{t('admin.dashboard.systemLinkMeta')}</span>
              </span>
            </Link>
          </div>
        </Card>
      </div>
    </AdminShell>
  )
}

'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  Clock,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  UserX,
} from 'lucide-react'
import { Amount, Badge, Button, Card, CardHeader } from '@/ui'
import type { BadgeTone } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type { DashboardView, PoolCardView } from '@/server/admin/dashboard'
import { AdminShell } from './AdminShell'
import { useAdmin } from './_store/AdminStore'
import { refreshPoolsAction } from './actions'
import styles from './admin.module.css'

/** Пороги покрытия — в `src/server/services/pool.ts`. Здесь только
 *  цвет: состояние приходит посчитанным, сравнивать проценты в
 *  разметке значило бы считать деньги в двух местах. */
const COVERAGE: Record<PoolCardView['state'], BadgeTone> = {
  ok: 'success',
  warn20: 'warning',
  warn15: 'warning',
  urgent10: 'danger',
  critical: 'danger',
}

function PoolCard({ company }: { company: PoolCardView }) {
  const { t } = useI18n()
  return (
    <Card density="dense">
      <div className={styles.kpiLabel}>
        {company.name}
        <Badge tone={COVERAGE[company.state]} solid={company.state === 'critical'}>
          {t(`admin.coverage.${company.state}.label`)}
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

      <p className={styles.kpiHint}>{t(`admin.coverage.${company.state}.hint`)}</p>
    </Card>
  )
}

export function DashboardScreen({ data }: { data: DashboardView }) {
  const { locale, t } = useI18n()
  const { can } = useAdmin()
  const [refreshing, startRefresh] = useTransition()

  const queue = [
    {
      href: '/admin/deposits',
      icon: ArrowDownToLine,
      title: t('admin.dashboard.queue.deposits'),
      meta: data.queue.oldestDepositAt
        ? t('admin.dashboard.queue.depositsMeta', {
            date: formatDateTime(locale, data.queue.oldestDepositAt),
          })
        : t('admin.dashboard.queue.depositsEmpty'),
      count: data.queue.deposits,
    },
    {
      href: '/admin/users?filter=negative',
      icon: TrendingDown,
      title: t('admin.dashboard.queue.negative'),
      meta: t('admin.dashboard.queue.negativeMeta'),
      count: data.queue.negativeUsers,
    },
    {
      href: '/admin/system',
      icon: ArrowLeftRight,
      title: t('admin.dashboard.queue.transfers'),
      meta: t('admin.dashboard.queue.transfersMeta'),
      count: data.queue.pendingTransfers,
    },
    {
      href: '/admin/users?filter=stuck',
      icon: UserX,
      title: t('admin.dashboard.queue.stuck'),
      meta: t('admin.dashboard.queue.stuckMeta'),
      count: data.queue.stuckUsers,
    },
    {
      href: '/admin/cards?status=CLOSING',
      icon: Clock,
      title: t('admin.dashboard.queue.closing'),
      meta: t('admin.dashboard.queue.closingMeta'),
      count: data.queue.closingCards,
    },
    {
      href: '/admin/system',
      icon: ShieldAlert,
      title: t('admin.dashboard.queue.errors'),
      meta: t('admin.dashboard.queue.errorsMeta'),
      count: data.queue.integrationErrors,
    },
    {
      href: '/admin/audit?action=TELEGRAM_LINKED_BY_RECOVERY',
      icon: AlertTriangle,
      title: t('admin.dashboard.queue.telegram'),
      meta: t('admin.dashboard.queue.telegramMeta'),
      count: data.queue.recoveryLinks,
    },
  ]

  const mayRefresh = can('APPROVE_DEPOSITS')

  return (
    <AdminShell
      title={t('admin.dashboard.title')}
      note={t('admin.dashboard.note')}
      action={
        mayRefresh ? (
          <Button
            variant="secondary"
            iconStart={<RefreshCw size={16} />}
            disabled={refreshing}
            onClick={() =>
              startRefresh(async () => {
                await refreshPoolsAction()
              })
            }
          >
            {t('admin.dashboard.refreshPools')}
          </Button>
        ) : null
      }
    >
      {/* Выручка стоит первой строкой. Пулы и очереди — работа
          оператора, а это ответ на вопрос, ради которого смотрят
          дашборд: сколько через нас прошло и сколько мы заработали.

          Это НАШИ деньги, а не деньги компаний и пользователей, —
          так и подписано: спутать их здесь легко, а последствия
          дорогие. */}
      <div className={styles.grid2}>
        <Card density="dense">
          <div className={styles.kpiLabel}>
            {t('admin.revenue.profit')}
            <Badge tone="neutral">{t('admin.revenue.period')}</Badge>
          </div>
          <Amount value={data.revenue.profit} currency="USD" size="kpi" />
          <div className={styles.kpiRows}>
            <div className={styles.kpiRow}>
              <span className={styles.kpiRowLabel}>{t('admin.revenue.fromDeposits')}</span>
              <Amount value={data.revenue.fromDeposits} currency="USD" size="caption" />
            </div>
            <div className={styles.kpiRow}>
              <span className={styles.kpiRowLabel}>{t('admin.revenue.fromWithdrawals')}</span>
              <Amount value={data.revenue.fromWithdrawals} currency="USD" size="caption" />
            </div>
          </div>
          <p className={styles.kpiHint}>{t('admin.revenue.profitHint')}</p>
        </Card>

        <Card density="dense">
          <div className={styles.kpiLabel}>{t('admin.revenue.inflow')}</div>
          <Amount value={data.revenue.inflow} currency="USD" size="kpi" />
          <div className={styles.kpiRows}>
            {data.revenue.networks.length === 0 ? (
              <p className={styles.kpiHint}>{t('admin.revenue.noInflow')}</p>
            ) : (
              data.revenue.networks.map((network) => (
                <div className={styles.kpiRow} key={`${network.id}-${network.asset}`}>
                  <span className={styles.kpiRowLabel}>
                    {network.name} · {network.asset}
                  </span>
                  <span className={styles.networkTitle}>
                    <Amount value={network.amount} currency="USD" size="caption" />
                    <span className={styles.company}>
                      {t('admin.revenue.share', { value: network.share })}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className={styles.grid4}>
        {data.pools.map((company) => (
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
              <span className={styles.rowValue}>
                {data.health.eventLagSeconds === null
                  ? t('admin.dashboard.never')
                  : t('admin.seconds', { value: data.health.eventLagSeconds })}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t('admin.dashboard.unprocessed')}</span>
              <span className={styles.rowValue}>{data.health.unprocessedEvents}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t('admin.dashboard.lastPoolRead')}</span>
              <span className={styles.rowValue}>
                {data.health.lastPoolRead
                  ? formatDateTime(locale, data.health.lastPoolRead)
                  : t('admin.dashboard.never')}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t('admin.dashboard.throttling')}</span>
              <span className={styles.rowValue}>
                {data.health.throttling ? (
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

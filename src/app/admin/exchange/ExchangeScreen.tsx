'use client'

import { ArrowDownLeft, ArrowUpRight, Inbox } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  Input,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Toast,
} from '@/ui'
import type { BadgeTone, SelectOption } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type { ExchangeRow } from '@/server/admin/journals'
import { AdminShell } from '../AdminShell'
import { Pager } from '../_components/Pager'
import { useListParams } from '../_components/useListParams'
import styles from '../admin.module.css'

/**
 * Журнал обмена.
 *
 * Каждый наш запрос наружу и каждое принятое событие. Их API менялся
 * ломающими изменениями еженедельно, и без собственной записи «что
 * отправили и что получили» разбирать нечего: у них свой лог, у нас
 * свой, сходятся они по `requestId`.
 *
 * От журнала аудита отличается предметом. Аудит отвечает «кто из
 * операторов что сделал», этот журнал — «что ушло наружу и что пришло
 * обратно».
 *
 * Тела записаны **уже вычищенными**: номер карты, CVV, PIN и ключи
 * доступа в журнал не попадают ни в каком виде. Вычистка происходит до
 * записи, а не при показе — иначе однажды она окажется забытой.
 *
 * Разреза по компании здесь нет, и это не упущение: предмет записи —
 * вызов сервиса, а не деньги компании. Разбирают его по сервису,
 * исходу и `requestId`.
 */

const DIRECTION_KEYS: { value: string; key: string }[] = [
  { value: '', key: 'admin.exchange.dir.all' },
  { value: 'OUT', key: 'admin.exchange.dir.out' },
  { value: 'IN', key: 'admin.exchange.dir.in' },
]

/** Исходов два. Повторы живут внутри одного вызова — цикл восстановления
 *  отрабатывает до того, как вызов вернётся, — поэтому отдельного
 *  «повторён» в журнале нет: была бы колонка, которая всегда пуста. */
const OUTCOME_KEYS: { value: string; key: string }[] = [
  { value: '', key: 'admin.exchange.outcome.all' },
  { value: 'OK', key: 'admin.exchange.outcome.ok' },
  { value: 'FAILED', key: 'admin.exchange.outcome.failed' },
]

const OUTCOME_TONE: Record<string, BadgeTone> = {
  OK: 'success',
  FAILED: 'danger',
}

const SERVICE_KEY: Record<string, string> = {
  OXEN: 'oxen',
  WALLET: 'addresses',
  AML: 'aml',
}

export function ExchangeScreen({
  rows,
  total,
  page,
  pageSize,
  open,
}: {
  rows: ExchangeRow[]
  total: number
  page: number
  pageSize: number
  open: ExchangeRow | null
}) {
  const { locale, t } = useI18n()
  const params = useListParams()

  const serviceOptions: SelectOption[] = [
    { value: '', label: t('admin.exchange.allServices') },
    { value: 'OXEN', label: t('admin.service.oxen') },
    { value: 'WALLET', label: t('admin.service.addresses') },
    { value: 'AML', label: t('admin.service.aml') },
  ]
  const directionOptions: SelectOption[] = DIRECTION_KEYS.map((option) => ({
    value: option.value,
    label: t(option.key),
  }))
  const outcomeOptions: SelectOption[] = OUTCOME_KEYS.map((option) => ({
    value: option.value,
    label: t(option.key),
  }))

  return (
    <AdminShell title={t('admin.exchange.title')} note={t('admin.exchange.note')}>
      <Toast
        tone="neutral"
        title={t('admin.exchange.secretsTitle')}
        text={t('admin.exchange.secretsText')}
      />

      {params.get('request') ? (
        <Toast
          tone="neutral"
          title={t('admin.exchange.byRequestTitle')}
          text={params.get('request')}
          onClose={() => params.set({ request: '' })}
        />
      ) : null}

      <div className={styles.filters}>
        <div className={styles.filterGrow}>
          <Input
            label={t('admin.filter.search')}
            placeholder={t('admin.exchange.searchPlaceholder')}
            defaultValue={params.get('q')}
            onChange={(e) => params.set({ q: e.target.value })}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.exchange.service')}
            options={serviceOptions}
            value={params.get('service')}
            onChange={(next) => params.set({ service: next })}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.exchange.direction')}
            options={directionOptions}
            value={params.get('direction')}
            onChange={(next) => params.set({ direction: next })}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.exchange.outcome')}
            options={outcomeOptions}
            value={params.get('outcome')}
            onChange={(next) => params.set({ outcome: next })}
          />
        </div>
      </div>

      <Card density="flush">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={24} />}
            title={t('admin.exchange.emptyTitle')}
            text={t('admin.exchange.emptyText')}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('admin.tx.col.time')}</TH>
                <TH>{t('admin.exchange.service')}</TH>
                <TH>{t('admin.exchange.direction')}</TH>
                <TH>{t('admin.exchange.col.what')}</TH>
                <TH>{t('admin.exchange.col.subject')}</TH>
                <TH>{t('admin.exchange.col.code')}</TH>
                <TH align="numeric">{t('admin.exchange.col.duration')}</TH>
                <TH>requestId</TH>
                <TH>{t('admin.exchange.outcome')}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((entry) => (
                <TR
                  key={entry.id}
                  flagged={entry.outcome !== 'OK'}
                  onClick={() => params.set({ open: entry.id })}
                >
                  <TD muted>{formatDateTime(locale, entry.at)}</TD>
                  <TD muted>{t(`admin.service.${SERVICE_KEY[entry.service] ?? 'oxen'}`)}</TD>
                  <TD muted>
                    <span className={styles.cellFlow}>
                      {entry.direction === 'OUT' ? (
                        <ArrowUpRight size={14} aria-hidden />
                      ) : (
                        <ArrowDownLeft size={14} aria-hidden />
                      )}
                      {entry.direction === 'OUT'
                        ? t('admin.exchange.rowOut')
                        : t('admin.exchange.rowIn')}
                    </span>
                  </TD>
                  <TD primary>
                    <span className={styles.endpoint}>
                      {entry.method} {entry.path}
                    </span>
                  </TD>
                  <TD muted>
                    <span className={styles.endpoint}>{entry.subject ?? '—'}</span>
                  </TD>
                  <TD muted>
                    <span className={styles.mono}>
                      {entry.status ?? entry.errorCode ?? '—'}
                    </span>
                  </TD>
                  <TD align="numeric" muted>
                    {t('admin.exchange.ms', { value: entry.durationMs })}
                  </TD>
                  <TD muted>
                    <span className={styles.endpoint}>{entry.requestId ?? '—'}</span>
                  </TD>
                  <TD>
                    <Badge tone={OUTCOME_TONE[entry.outcome] ?? 'neutral'}>
                      {t(`admin.exchange.outcome.${entry.outcome === 'OK' ? 'ok' : 'failed'}`)}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Pager page={page} pageSize={pageSize} total={total} onPage={params.setPage} />

      <Drawer
        open={open !== null}
        onClose={() => params.set({ open: '' })}
        title={open ? `${open.method} ${open.path}` : t('admin.exchange.entryTitle')}
        subtitle={open ? formatDateTime(locale, open.at) : undefined}
        footer={
          <Button variant="secondary" onClick={() => params.set({ open: '' })}>
            {t('admin.profile.close')}
          </Button>
        }
      >
        {open ? (
          <>
            {open.error ? (
              <Toast tone="warning" title={t('admin.exchange.reviewTitle')} text={open.error} />
            ) : null}

            <Card density="dense">
              <CardHeader title={t('admin.exchange.entryTitle')} />
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.exchange.direction')}</span>
                  <span className={styles.rowValue}>
                    {open.direction === 'OUT'
                      ? t('admin.exchange.dirOutLong')
                      : t('admin.exchange.dirInLong')}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.exchange.col.subject')}</span>
                  <span className={styles.rowValue}>
                    <span className={styles.mono}>{open.subject ?? '—'}</span>
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.exchange.responseCode')}</span>
                  <span className={styles.rowValue}>
                    <span className={styles.mono}>
                      {open.status ?? open.errorCode ?? t('admin.exchange.noCode')}
                    </span>
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.exchange.duration')}</span>
                  <span className={styles.rowValue}>
                    {t('admin.exchange.ms', { value: open.durationMs })}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>requestId</span>
                  <span className={styles.rowValue}>
                    <span className={styles.mono}>{open.requestId ?? '—'}</span>
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.exchange.outcome')}</span>
                  <span className={styles.rowValue}>
                    <Badge tone={OUTCOME_TONE[open.outcome] ?? 'neutral'}>
                      {t(`admin.exchange.outcome.${open.outcome === 'OK' ? 'ok' : 'failed'}`)}
                    </Badge>
                  </span>
                </div>
              </div>
            </Card>

            {open.request ? (
              <Card density="dense">
                <CardHeader
                  title={t('admin.exchange.sent')}
                  subtitle={t('admin.exchange.sentSubtitle')}
                />
                <pre className={styles.raw}>{JSON.stringify(open.request, null, 2)}</pre>
                <p className={styles.kpiHint}>{t('admin.exchange.sentHint')}</p>
              </Card>
            ) : null}

            <Card density="dense">
              <CardHeader
                title={
                  open.direction === 'OUT'
                    ? t('admin.exchange.received')
                    : t('admin.exchange.eventBody')
                }
                subtitle={t('admin.exchange.receivedSubtitle')}
              />
              <pre className={styles.raw}>
                {open.response === null
                  ? t('admin.exchange.noBody')
                  : JSON.stringify(open.response, null, 2)}
              </pre>
              <p className={styles.kpiHint}>{t('admin.exchange.receivedHint')}</p>
            </Card>
          </>
        ) : null}
      </Drawer>
    </AdminShell>
  )
}

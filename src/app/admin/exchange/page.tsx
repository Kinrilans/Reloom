'use client'

import { useEffect, useState } from 'react'
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
import { EXCHANGE_LOG, companyName } from '@/fixtures/admin'
import type { ExchangeOutcome } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from '../AdminShell'
import { Pager, pageSlice } from '../_components/Pager'
import styles from '../admin.module.css'

const PAGE_SIZE = 20

/**
 * Журнал обмена с эмитентом.
 *
 * Каждый наш запрос и каждое принятое событие. Их API менялся ломающими
 * изменениями еженедельно, и без собственной записи «что отправили и что
 * получили» разбирать нечего: у них свой лог, у нас свой, сходятся они
 * по requestId.
 *
 * От журнала аудита отличается предметом. Аудит отвечает «кто из
 * операторов что сделал», этот журнал — «что ушло наружу и что пришло
 * обратно». Первый читают при разборе с человеком, второй — при разборе
 * с эмитентом.
 *
 * Тела записаны уже вычищенными: номер карты, CVV, PIN и ключи доступа
 * в журнал не попадают ни в каком виде. Вычистка происходит до записи,
 * а не при показе — иначе однажды она окажется забытой.
 */

const DIRECTION_KEYS: { value: string; key: string }[] = [
  { value: 'all', key: 'admin.exchange.dir.all' },
  { value: 'out', key: 'admin.exchange.dir.out' },
  { value: 'in', key: 'admin.exchange.dir.in' },
]

const OUTCOME_KEYS: { value: string; key: string }[] = [
  { value: 'all', key: 'admin.exchange.outcome.all' },
  { value: 'ok', key: 'admin.exchange.outcome.ok' },
  { value: 'retried', key: 'admin.exchange.outcome.retried' },
  { value: 'failed', key: 'admin.exchange.outcome.failed' },
]

const OUTCOME_TONE: Record<ExchangeOutcome, BadgeTone> = {
  ok: 'success',
  retried: 'warning',
  failed: 'danger',
}

export default function ExchangePage() {
  const { locale, t } = useI18n()
  const { byCompany, isAllCompanies } = useAdmin()

  /* Сервисов стало три, и разбирают их по отдельности: у выпуска карты
     и у проверки AML разные поводы заглянуть в журнал. */
  /* Сюда приходят из «Состояния системы» со ссылкой вида
     ?request=req_… — чтобы разбор начинался с нужной строки, а не
     с поиска её руками. Параметр читается после монтирования: на
     сервере его ещё нет, и разметка разъехалась бы с клиентской. */
  const [service, setService] = useState('all')
  const [direction, setDirection] = useState('all')
  const [outcome, setOutcome] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    const request = new URLSearchParams(window.location.search).get('request')
    if (request) setQuery(request)
  }, [])

  const filtered = byCompany(EXCHANGE_LOG)
    .filter((e) => (service === 'all' ? true : e.service === service))
    .filter((e) => (direction === 'all' ? true : e.direction === direction))
    .filter((e) => (outcome === 'all' ? true : e.outcome === outcome))
    .filter((e) => {
      const q = query.trim().toLowerCase()
      return (
        q.length === 0 ||
        e.path.toLowerCase().includes(q) ||
        e.requestId.toLowerCase().includes(q) ||
        (e.status ?? '').includes(q)
      )
    })

  const rows = pageSlice(filtered, page, PAGE_SIZE)
  const open = EXCHANGE_LOG.find((e) => e.id === openId)

  const serviceOptions: SelectOption[] = [
    { value: 'all', label: t('admin.exchange.allServices') },
    { value: 'oxen', label: t('admin.service.oxen') },
    { value: 'addresses', label: t('admin.service.addresses') },
    { value: 'aml', label: t('admin.service.aml') },
  ]
  const directionOptions: SelectOption[] = DIRECTION_KEYS.map((o) => ({ value: o.value, label: t(o.key) }))
  const outcomeOptions: SelectOption[] = OUTCOME_KEYS.map((o) => ({ value: o.value, label: t(o.key) }))

  return (
    <AdminShell
      title={t('admin.exchange.title')}
      note={t('admin.exchange.note')}
    >
      <Toast
        tone="neutral"
        title={t('admin.exchange.secretsTitle')}
        text={t('admin.exchange.secretsText')}
      />

      <div className={styles.filters}>
        <div className={styles.filterGrow}>
          <Input
            label={t('admin.filter.search')}
            placeholder={t('admin.exchange.searchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.exchange.service')}
            options={serviceOptions}
            value={service}
            onChange={(v) => {
              setService(v)
              setPage(0)
            }}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.exchange.direction')}
            options={directionOptions}
            value={direction}
            onChange={(v) => {
              setDirection(v)
              setPage(0)
            }}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.exchange.outcome')}
            options={outcomeOptions}
            value={outcome}
            onChange={(v) => {
              setOutcome(v)
              setPage(0)
            }}
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
                {isAllCompanies ? <TH>{t('admin.col.company')}</TH> : null}
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
                  flagged={entry.outcome !== 'ok'}
                  onClick={() => setOpenId(entry.id)}
                >
                  <TD muted>{formatDateTime(locale, entry.at)}</TD>
                  <TD muted>{t(`admin.service.${entry.service}`)}</TD>
                  <TD muted>
                    <span className={styles.cellFlow}>
                      {entry.direction === 'out' ? (
                        <ArrowUpRight size={14} aria-hidden />
                      ) : (
                        <ArrowDownLeft size={14} aria-hidden />
                      )}
                      {entry.direction === 'out' ? t('admin.exchange.rowOut') : t('admin.exchange.rowIn')}
                    </span>
                  </TD>
                  <TD primary>
                    <span className={styles.endpoint}>
                      {entry.method} {entry.path}
                    </span>
                  </TD>
                  {isAllCompanies ? <TD muted>{companyName(entry.companyId)}</TD> : null}
                  <TD muted>
                    <span className={styles.mono}>{entry.status ?? '—'}</span>
                  </TD>
                  <TD align="numeric" muted>
                    {t('admin.exchange.ms', { value: entry.durationMs })}
                  </TD>
                  <TD muted>
                    <span className={styles.endpoint}>{entry.requestId}</span>
                  </TD>
                  <TD>
                    <Badge tone={OUTCOME_TONE[entry.outcome]}>
                      {t(`admin.exchange.outcome.${entry.outcome}`)}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />

      <Drawer
        open={open !== undefined}
        onClose={() => setOpenId(null)}
        title={open ? `${open.method} ${open.path}` : 'Запись журнала'}
        subtitle={open ? formatDateTime(locale, open.at) : undefined}
        footer={
          <Button variant="secondary" onClick={() => setOpenId(null)}>
            {t('admin.profile.close')}
          </Button>
        }
      >
        {open ? (
          <>
            {open.noteCode ? (
              <Toast
                tone="warning"
                title={t('admin.exchange.reviewTitle')}
                text={t(`admin.exchange.note.${open.noteCode}`)}
              />
            ) : null}

            <Card density="dense">
              <CardHeader title={t('admin.exchange.entryTitle')} />
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.exchange.direction')}</span>
                  <span className={styles.rowValue}>
                    {open.direction === 'out'
                      ? t('admin.exchange.dirOutLong')
                      : t('admin.exchange.dirInLong')}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.col.company')}</span>
                  <span className={styles.rowValue}>{companyName(open.companyId)}</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.exchange.responseCode')}</span>
                  <span className={styles.rowValue}>
                    <span className={styles.mono}>{open.status ?? t('admin.exchange.noCode')}</span>
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.exchange.duration')}</span>
                  <span className={styles.rowValue}>{t('admin.exchange.ms', { value: open.durationMs })}</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>requestId</span>
                  <span className={styles.rowValue}>
                    <span className={styles.mono}>{open.requestId}</span>
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.exchange.outcome')}</span>
                  <span className={styles.rowValue}>
                    <Badge tone={OUTCOME_TONE[open.outcome]}>
                      {t(`admin.exchange.outcome.${open.outcome}`)}
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
                <pre className={styles.raw}>{open.request}</pre>
                <p className={styles.kpiHint}>{t('admin.exchange.sentHint')}</p>
              </Card>
            ) : null}

            <Card density="dense">
              <CardHeader
                title={
                  open.direction === 'out' ? t('admin.exchange.received') : t('admin.exchange.eventBody')
                }
                subtitle={t('admin.exchange.receivedSubtitle')}
              />
              <pre className={styles.raw}>{open.response}</pre>
              <p className={styles.kpiHint}>{t('admin.exchange.receivedHint')}</p>
            </Card>
          </>
        ) : null}
      </Drawer>
    </AdminShell>
  )
}

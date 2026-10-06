'use client'

import { useState } from 'react'
import { Download, Inbox, TriangleAlert } from 'lucide-react'
import {
  Amount,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/ui'
import type { SelectOption } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { TRANSACTIONS, companyName } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from '../AdminShell'
import { Pager, pageSlice } from '../_components/Pager'
import { TransactionDrawer } from './_components/TransactionDrawer'
import styles from '../admin.module.css'

const PAGE_SIZE = 25

const STATUS_KEYS: { value: string; key: string }[] = [
  { value: 'all', key: 'admin.tx.status.all' },
  { value: 'completed', key: 'admin.tx.status.completed' },
  { value: 'pending', key: 'admin.tx.status.pending' },
  { value: 'declined', key: 'admin.tx.status.declined' },
  { value: 'refund', key: 'admin.tx.status.refund' },
  { value: 'reversed', key: 'admin.tx.status.reversed' },
  { value: 'anomaly', key: 'admin.tx.status.anomaly' },
]

/* Коды отказа и аномалий переводятся словарём: от эмитента они приходят
   кодами, и показываем мы не их данные, а свою интерпретацию
   (CLAUDE.md, правило 3e). Отказ по пулу компании пользователю виден как
   технические работы, в админке — настоящей причиной. */

export default function TransactionsPage() {
  const { locale, t } = useI18n()
  const { byCompany, isAllCompanies } = useAdmin()

  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  /* Карточка открывается панелью поверх списка: фильтры, страница и
     прокрутка остаются на месте. */
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = byCompany(TRANSACTIONS)
    .filter((t) =>
      status === 'all' ? true : status === 'anomaly' ? t.anomaly !== null : t.status === status,
    )
    .filter((t) => {
      const q = query.trim().toLowerCase()
      return (
        q.length === 0 ||
        t.merchant.toLowerCase().includes(q) ||
        t.userName.toLowerCase().includes(q) ||
        t.cardLast4.includes(q)
      )
    })

  const rows = pageSlice(filtered, page, PAGE_SIZE)

  const statusOptions: SelectOption[] = STATUS_KEYS.map((o) => ({ value: o.value, label: t(o.key) }))

  return (
    <AdminShell
      title={t('admin.tx.title')}
      note={t('admin.tx.note')}
      action={
        <Button variant="secondary" iconStart={<Download size={16} />}>
          {t('admin.action.exportCsv')}
        </Button>
      }
    >
      <div className={styles.filters}>
        <div className={styles.filterGrow}>
          <Input
            label={t('admin.filter.search')}
            placeholder={t('admin.tx.searchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.col.status')}
            options={statusOptions}
            value={status}
            onChange={(v) => {
              setStatus(v)
              setPage(0)
            }}
          />
        </div>
      </div>

      <Card density="flush">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={24} />}
            title={t('admin.tx.emptyTitle')}
            text={t('admin.tx.emptyText')}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('admin.tx.col.time')}</TH>
                <TH>{t('admin.col.user')}</TH>
                {isAllCompanies ? <TH>{t('admin.col.company')}</TH> : null}
                <TH>{t('admin.col.card')}</TH>
                <TH>{t('admin.tx.col.merchant')}</TH>
                <TH align="numeric">{t('admin.tx.col.amount')}</TH>
                <TH>{t('admin.tx.col.localCurrency')}</TH>
                <TH>{t('admin.col.status')}</TH>
                <TH>{t('admin.tx.col.declineReason')}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((tx) => (
                <TR
                  key={tx.id}
                  flagged={tx.anomaly !== null}
                  onClick={() => setOpenId(tx.id)}
                >
                  <TD muted>{formatDateTime(locale, tx.at)}</TD>
                  <TD>{tx.userName}</TD>
                  {isAllCompanies ? <TD muted>{companyName(tx.companyId)}</TD> : null}
                  <TD muted>•••• {tx.cardLast4}</TD>
                  <TD primary>
                    <span className={styles.cellFlow}>
                      {tx.merchant}
                      {tx.anomaly ? (
                        <span className={styles.flagCell}>
                          <TriangleAlert size={12} />
                          {t(`admin.anomaly.${tx.anomaly}`)}
                        </span>
                      ) : null}
                    </span>
                  </TD>
                  <TD align="numeric">
                    <Amount
                      value={tx.amount}
                      currency={tx.currency}
                      size="caption"
                      struck={tx.status === 'declined' || tx.status === 'reversed'}
                    />
                  </TD>
                  <TD muted>
                    {tx.localAmount ? `${tx.localAmount} ${tx.localCurrency}` : tx.currency}
                  </TD>
                  <TD>
                    <Badge
                      tone={
                        tx.status === 'declined'
                          ? 'danger'
                          : tx.status === 'pending'
                            ? 'warning'
                            : tx.status === 'refund'
                              ? 'brand'
                              : tx.status === 'reversed'
                                ? 'neutral'
                                : 'success'
                      }
                    >
                      {tx.status === 'completed'
                        ? t('admin.tx.status.completed')
                        : tx.status === 'pending'
                          ? t('admin.tx.status.pending')
                          : tx.status === 'declined'
                            ? t('admin.tx.status.declined')
                            : tx.status === 'refund'
                              ? t('admin.tx.status.refund')
                              : t('admin.tx.status.reversed')}
                    </Badge>
                  </TD>
                  <TD muted>
                    {tx.declineReasonCode ? t(`admin.decline.${tx.declineReasonCode}`) : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />

      <TransactionDrawer transactionId={openId} onClose={() => setOpenId(null)} />
    </AdminShell>
  )
}

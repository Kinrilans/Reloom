'use client'

import { Download, Inbox, TriangleAlert } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
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
import type { BadgeTone, SelectOption } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type {
  TransactionDetail,
  TransactionFilter,
  TransactionRow,
} from '@/server/admin/transactions'
import { AdminShell } from '../AdminShell'
import { useAdmin } from '../_store/AdminStore'
import { Pager } from '../_components/Pager'
import { useListParams } from '../_components/useListParams'
import { TransactionDrawer } from './_components/TransactionDrawer'
import styles from '../admin.module.css'

const STATUS_KEYS: { value: TransactionFilter; key: string }[] = [
  { value: 'all', key: 'admin.tx.status.all' },
  { value: 'completed', key: 'admin.tx.status.completed' },
  { value: 'pending', key: 'admin.tx.status.pending' },
  { value: 'declined', key: 'admin.tx.status.declined' },
  { value: 'refund', key: 'admin.tx.status.refund' },
  { value: 'reversed', key: 'admin.tx.status.reversed' },
  { value: 'anomaly', key: 'admin.tx.status.anomaly' },
]

const TONE: Record<TransactionRow['display'], BadgeTone> = {
  completed: 'success',
  pending: 'warning',
  declined: 'danger',
  refund: 'brand',
  reversed: 'neutral',
}

export function TransactionsScreen({
  rows,
  total,
  page,
  pageSize,
  status,
  open,
}: {
  rows: TransactionRow[]
  total: number
  page: number
  pageSize: number
  status: TransactionFilter
  open: TransactionDetail | null
}) {
  const { locale, t } = useI18n()
  const { isAllCompanies } = useAdmin()
  const params = useListParams()
  const search = useSearchParams()

  const statusOptions: SelectOption[] = STATUS_KEYS.map((option) => ({
    value: option.value,
    label: t(option.key),
  }))

  return (
    <AdminShell
      title={t('admin.tx.title')}
      note={t('admin.tx.note')}
      action={
        /* Выгрузка уходит тем же отбором, что на экране: иначе
           оператор выгружает одно, а видел другое. */
        <Button
          variant="secondary"
          iconStart={<Download size={16} />}
          onClick={() => {
            window.location.href = `/admin/transactions/export?${search.toString()}`
          }}
        >
          {t('admin.action.exportCsv')}
        </Button>
      }
    >
      <div className={styles.filters}>
        <div className={styles.filterGrow}>
          <Input
            label={t('admin.filter.search')}
            placeholder={t('admin.tx.searchPlaceholder')}
            defaultValue={params.get('q')}
            onChange={(e) => params.set({ q: e.target.value })}
          />
        </div>
        <div className={styles.filter}>
          <Input
            label={t('admin.filter.from')}
            type="date"
            defaultValue={params.get('from')}
            onChange={(e) => params.set({ from: e.target.value })}
          />
        </div>
        <div className={styles.filter}>
          <Input
            label={t('admin.filter.to')}
            type="date"
            defaultValue={params.get('to')}
            onChange={(e) => params.set({ to: e.target.value })}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.col.status')}
            options={statusOptions}
            value={status}
            onChange={(next) => params.set({ status: next })}
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
              {rows.map((transaction) => (
                <TR
                  key={transaction.id}
                  flagged={transaction.anomaly !== null}
                  onClick={() => params.set({ open: transaction.id })}
                >
                  <TD muted>{formatDateTime(locale, transaction.at)}</TD>
                  <TD>{transaction.userName}</TD>
                  {isAllCompanies ? <TD muted>{transaction.companyName}</TD> : null}
                  <TD muted>•••• {transaction.cardLast4 ?? '????'}</TD>
                  <TD primary>
                    <span className={styles.cellFlow}>
                      {/* Название мерчанта приходит сырым и не
                          переводится никогда. */}
                      {transaction.merchant ?? '—'}
                      {transaction.anomaly ? (
                        <span className={styles.flagCell}>
                          <TriangleAlert size={12} />
                          {t(`admin.anomaly.${transaction.anomaly}`)}
                        </span>
                      ) : null}
                    </span>
                  </TD>
                  <TD align="numeric">
                    <Amount
                      value={transaction.amount}
                      currency={transaction.currency}
                      size="caption"
                      struck={
                        transaction.display === 'declined' || transaction.display === 'reversed'
                      }
                    />
                  </TD>
                  <TD muted>
                    {transaction.localAmount
                      ? `${transaction.localAmount} ${transaction.localCurrency ?? ''}`
                      : transaction.currency}
                  </TD>
                  <TD>
                    <Badge tone={TONE[transaction.display]}>
                      {t(`admin.tx.status.${transaction.display}`)}
                    </Badge>
                  </TD>
                  <TD muted>
                    {transaction.declineReason
                      ? t(`admin.decline.${transaction.declineReason}`)
                      : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Pager page={page} pageSize={pageSize} total={total} onPage={params.setPage} />

      <TransactionDrawer transaction={open} onClose={() => params.set({ open: '' })} />
    </AdminShell>
  )
}

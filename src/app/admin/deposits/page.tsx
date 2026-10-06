'use client'

import { useState } from 'react'
import { ExternalLink, Inbox, TriangleAlert } from 'lucide-react'
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
import { companyName } from '@/fixtures/admin'
import { DEPOSITS } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from '../AdminShell'
import { Pager, pageSlice } from '../_components/Pager'
import { DepositDrawer } from './_components/DepositDrawer'
import styles from '../admin.module.css'

const PAGE_SIZE = 10

const STATUS_KEYS: { value: string; key: string }[] = [
  { value: 'SUBMITTED', key: 'admin.deposits.status.submitted' },
  { value: 'CREDITED', key: 'admin.deposits.status.credited' },
  { value: 'REJECTED', key: 'admin.deposits.status.rejected' },
  { value: 'all', key: 'admin.tx.status.all' },
]

export default function DepositsPage() {
  const { locale, t } = useI18n()
  const { byCompany, isAllCompanies } = useAdmin()

  const [status, setStatus] = useState('SUBMITTED')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  /* Карточка открывается панелью поверх списка: фильтры, страница и
     прокрутка остаются на месте. */
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = byCompany(DEPOSITS)
    .filter((d) => (status === 'all' ? true : d.status === status))
    .filter((d) => d.userName.toLowerCase().includes(query.trim().toLowerCase()))
    // Старые сверху: заявка, висящая сутки, должна быть первой.
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const rows = pageSlice(filtered, page, PAGE_SIZE)

  const statusOptions: SelectOption[] = STATUS_KEYS.map((o) => ({ value: o.value, label: t(o.key) }))

  return (
    <AdminShell
      title={t('admin.deposits.title')}
      note={t('admin.deposits.note')}
    >
      <div className={styles.filters}>
        <div className={styles.filterGrow}>
          <Input
            label={t('admin.deposits.searchLabel')}
            placeholder={t('admin.users.searchPlaceholder')}
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
            onChange={(next) => {
              setStatus(next)
              setPage(0)
            }}
          />
        </div>
      </div>

      <Card density="flush">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={24} />}
            title={t('admin.deposits.emptyTitle')}
            text={t('admin.deposits.emptyText')}
          />
        ) : (
          <Table>
              <THead>
                <TR>
                  <TH>{t('admin.col.user')}</TH>
                  {isAllCompanies ? <TH>{t('admin.col.company')}</TH> : null}
                  <TH align="numeric">{t('admin.deposits.col.declared')}</TH>
                  <TH>{t('admin.deposits.col.network')}</TH>
                  <TH>{t('admin.deposits.col.tx')}</TH>
                  <TH>{t('admin.deposits.col.age')}</TH>
                  <TH align="actions">{t('admin.col.action')}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((deposit) => (
                  <TR
                    key={deposit.id}
                    /* Строка без ссылки на транзакцию помечается: её
                       проверка дольше. */
                    flagged={!deposit.txLink}
                    onClick={() => setOpenId(deposit.id)}
                  >
                    <TD primary>{deposit.userName}</TD>
                    {isAllCompanies ? <TD muted>{companyName(deposit.companyId)}</TD> : null}
                    <TD align="numeric">
                      <Amount value={deposit.declared} currency="USD" size="caption" />
                    </TD>
                    <TD muted>
                      {deposit.network} · {deposit.asset}
                    </TD>
                    <TD>
                      {deposit.txLink ? (
                        <Badge tone="neutral" icon={<ExternalLink size={12} />} dot={false}>
                          {t('admin.deposits.hasLink')}
                        </Badge>
                      ) : (
                        <span className={styles.flagCell}>
                          <TriangleAlert size={14} />
                          {t('admin.deposits.noLink')}
                        </span>
                      )}
                    </TD>
                    <TD muted>{formatDateTime(locale, deposit.createdAt)}</TD>
                    <TD align="actions">
                      <div className={styles.actionsCell}>
                        <Button variant="ghost" size="sm" onClick={() => setOpenId(deposit.id)}>
                          {t('admin.action.open')}
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />

      <DepositDrawer depositId={openId} onClose={() => setOpenId(null)} />
    </AdminShell>
  )
}

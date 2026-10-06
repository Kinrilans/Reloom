'use client'

import { useState } from 'react'
import { Inbox } from 'lucide-react'
import {
  Badge,
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
  Toast,
} from '@/ui'
import type { SelectOption } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { AUDIT, OPERATORS, companyName } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from '../AdminShell'
import { Pager, pageSlice } from '../_components/Pager'
import styles from '../admin.module.css'

const PAGE_SIZE = 20

/**
 * Журнал аудита.
 *
 * Записи неудаляемы: интерфейс удаления не предусматривает. Отдельно
 * выделяются корректировки баланса, выводы, изменения прав и
 * переопределения комиссий — всё, что меняет деньги или доступ.
 */
export default function AuditPage() {
  const { locale, t } = useI18n()
  const { byCompany, isAllCompanies } = useAdmin()

  const [operator, setOperator] = useState('all')
  const [onlyHighlight, setOnlyHighlight] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const operatorOptions: SelectOption[] = [
    { value: 'all', label: t('admin.audit.allOperators') },
    ...OPERATORS.map((o) => ({ value: o.name, label: o.name })),
  ]

  const kindOptions: SelectOption[] = [
    { value: 'all', label: t('admin.audit.allKinds') },
    { value: 'highlight', label: t('admin.audit.onlyHighlight') },
  ]

  const filtered = byCompany(AUDIT)
    .filter((a) => (operator === 'all' ? true : a.operator === operator))
    .filter((a) => (onlyHighlight === 'all' ? true : a.highlight))
    .filter((a) => {
      const q = query.trim().toLowerCase()
      return q.length === 0 || a.target.toLowerCase().includes(q) || a.actionCode.toLowerCase().includes(q)
    })

  const rows = pageSlice(filtered, page, PAGE_SIZE)

  return (
    <AdminShell
      title={t('admin.audit.title')}
      note={t('admin.audit.note')}
    >
      <Toast
        tone="neutral"
        title={t('admin.audit.toastTitle')}
        text={t('admin.audit.toastText')}
      />

      <div className={styles.filters}>
        <div className={styles.filterGrow}>
          <Input
            label={t('admin.filter.search')}
            placeholder={t('admin.audit.searchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </div>
        <div className={styles.filter}>
          <Select label={t('admin.audit.col.operator')} options={operatorOptions} value={operator} onChange={(v) => { setOperator(v); setPage(0) }} />
        </div>
        <div className={styles.filter}>
          <Select label={t('admin.audit.kind')} options={kindOptions} value={onlyHighlight} onChange={(v) => { setOnlyHighlight(v); setPage(0) }} />
        </div>
      </div>

      <Card density="flush">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={24} />}
            title={t('admin.audit.emptyTitle')}
            text={t('admin.audit.emptyText')}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('admin.audit.col.when')}</TH>
                <TH>{t('admin.audit.col.operator')}</TH>
                <TH>{t('admin.audit.col.action')}</TH>
                <TH>{t('admin.audit.col.target')}</TH>
                {isAllCompanies ? <TH>{t('admin.col.company')}</TH> : null}
                <TH>{t('admin.audit.col.reason')}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((entry) => (
                <TR key={entry.id} flagged={entry.highlight}>
                  <TD muted>{formatDateTime(locale, entry.at)}</TD>
                  <TD>{entry.operator}</TD>
                  <TD primary>
                    <span className={styles.cellFlow}>
                      {t(`admin.audit.action.${entry.actionCode}`)}
                      {entry.highlight ? (
                        <Badge tone="warning">{t('admin.audit.highlight')}</Badge>
                      ) : null}
                    </span>
                  </TD>
                  <TD muted>
                    {t(`admin.audit.target.${entry.targetTypeCode}`)}: {entry.target}
                  </TD>
                  {isAllCompanies ? <TD muted>{companyName(entry.companyId)}</TD> : null}
                  <TD muted>{entry.reasonCode ? t(`admin.audit.reason.${entry.reasonCode}`) : '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
    </AdminShell>
  )
}

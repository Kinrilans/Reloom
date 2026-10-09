'use client'

import { useState } from 'react'
import { Inbox } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
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
import type { SelectOption } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type { AuditRow } from '@/server/admin/journals'
import { AdminShell } from '../AdminShell'
import { useAdmin } from '../_store/AdminStore'
import { Pager } from '../_components/Pager'
import { useListParams } from '../_components/useListParams'
import styles from '../admin.module.css'

/**
 * Журнал аудита.
 *
 * Для каждой записи есть снимок «до» и «после»: без него запись
 * отвечает «что сделали», но не «что из этого вышло», а разбор
 * начинается именно со второго вопроса.
 *
 * Действие хранится кодом и переводится при показе: оператор и
 * пользователь должны видеть одно событие каждый на своём языке
 * (CLAUDE.md, правило 3e).
 */
export function AuditScreen({
  rows,
  total,
  page,
  pageSize,
  operators,
  actions,
}: {
  rows: AuditRow[]
  total: number
  page: number
  pageSize: number
  operators: { id: string; fullName: string }[]
  actions: string[]
}) {
  const { locale, t } = useI18n()
  const { isAllCompanies } = useAdmin()
  const params = useListParams()
  const [open, setOpen] = useState<AuditRow | null>(null)

  const operatorOptions: SelectOption[] = [
    { value: '', label: t('admin.audit.allOperators') },
    ...operators.map((operator) => ({ value: operator.id, label: operator.fullName })),
  ]

  /* Список действий берётся из данных, а не из перечисления в коде:
     иначе фильтр обещает то, чего в журнале нет. */
  const actionOptions: SelectOption[] = [
    { value: '', label: t('admin.audit.allKinds') },
    ...actions.map((action) => ({ value: action, label: t(`admin.audit.action.${action}`) })),
  ]

  return (
    <AdminShell title={t('admin.audit.title')} note={t('admin.audit.note')}>
      <Toast
        tone="neutral"
        title={t('admin.audit.toastTitle')}
        text={t('admin.audit.toastText')}
      />

      <div className={styles.filters}>
        <div className={styles.filter}>
          <Select
            label={t('admin.audit.col.operator')}
            options={operatorOptions}
            value={params.get('operator')}
            onChange={(next) => params.set({ operator: next })}
          />
        </div>
        <div className={styles.filterGrow}>
          <Select
            label={t('admin.audit.kind')}
            options={actionOptions}
            value={params.get('action')}
            onChange={(next) => params.set({ action: next })}
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
                <TR key={entry.id} flagged={entry.highlight} onClick={() => setOpen(entry)}>
                  <TD muted>{formatDateTime(locale, entry.at)}</TD>
                  <TD>{entry.operatorName ?? t('admin.audit.system')}</TD>
                  <TD primary>
                    <span className={styles.cellFlow}>
                      {t(`admin.audit.action.${entry.action}`)}
                      {entry.highlight ? (
                        <Badge tone="warning">{t('admin.audit.highlight')}</Badge>
                      ) : null}
                    </span>
                  </TD>
                  <TD muted>
                    {t(`admin.audit.target.${entry.targetTypeCode}`)}:{' '}
                    {entry.target ?? entry.targetId}
                  </TD>
                  {isAllCompanies ? <TD muted>{entry.companyName ?? '—'}</TD> : null}
                  <TD muted>
                    {entry.reasonCode
                      ? t(`admin.audit.reason.${entry.reasonCode}`)
                      : (entry.reason ?? '—')}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Pager page={page} pageSize={pageSize} total={total} onPage={params.setPage} />

      {/* Снимок «до» и «после» — главное в записи: он отвечает, что
          из действия вышло. Суммы в нём строками: деньги не становятся
          числом с плавающей точкой даже в снимке для человека. */}
      <Drawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? t(`admin.audit.action.${open.action}`) : t('admin.audit.title')}
        subtitle={open ? formatDateTime(locale, open.at) : undefined}
        footer={
          <Button variant="secondary" onClick={() => setOpen(null)}>
            {t('admin.profile.close')}
          </Button>
        }
      >
        {open ? (
          <>
            <Card density="dense">
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.audit.col.operator')}</span>
                  <span className={styles.rowValue}>
                    {open.operatorName ?? t('admin.audit.system')}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.audit.col.target')}</span>
                  <span className={styles.rowValue}>
                    {t(`admin.audit.target.${open.targetTypeCode}`)}:{' '}
                    {open.target ?? open.targetId}
                  </span>
                </div>
                {open.reason ? (
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>{t('admin.audit.col.reason')}</span>
                    <span className={styles.rowValue}>{open.reason}</span>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card density="dense">
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.fees.colBefore')}</span>
                </div>
              </div>
              <pre className={styles.raw}>
                {open.before === null
                  ? t('admin.audit.noSnapshot')
                  : JSON.stringify(open.before, null, 2)}
              </pre>
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.fees.colAfter')}</span>
                </div>
              </div>
              <pre className={styles.raw}>
                {open.after === null
                  ? t('admin.audit.noSnapshot')
                  : JSON.stringify(open.after, null, 2)}
              </pre>
            </Card>
          </>
        ) : null}
      </Drawer>
    </AdminShell>
  )
}

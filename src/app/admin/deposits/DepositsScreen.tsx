'use client'

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
  Toast,
} from '@/ui'
import type { BadgeTone, SelectOption } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type { DepositDetail, DepositFilter, DepositRow } from '@/server/admin/deposits'
import { AdminShell } from '../AdminShell'
import { useAdmin } from '../_store/AdminStore'
import { Pager } from '../_components/Pager'
import { useListParams } from '../_components/useListParams'
import { DepositDrawer } from './_components/DepositDrawer'
import styles from '../admin.module.css'

const STATUS_KEYS: { value: string; key: string }[] = [
  /* Очередь — всё, что ждёт решения человека: и «на проверке»,
     и удержанное. Первым пунктом, потому что в ручном режиме экран
     именно за этим и открывают. */
  { value: 'queue', key: 'admin.deposits.status.queue' },
  { value: 'SUBMITTED', key: 'admin.deposits.status.submitted' },
  { value: 'HELD', key: 'admin.deposits.status.held' },
  { value: 'CREDITED', key: 'admin.deposits.status.credited' },
  { value: 'REJECTED', key: 'admin.deposits.status.rejected' },
  { value: 'REFUNDED', key: 'admin.deposits.status.refunded' },
  { value: 'all', key: 'admin.tx.status.all' },
]

/** Вердикт приходит в вокабуляре внешнего сервиса, подпись берётся
 *  своим словарём: переводим не данные, а их толкование. */
const AML_KEY: Record<string, string> = {
  PASSED: 'pass',
  FAILED: 'fail',
  UNAVAILABLE: 'unavailable',
}

const AML_TONE: Record<string, BadgeTone> = {
  PASSED: 'success',
  FAILED: 'danger',
  UNAVAILABLE: 'warning',
}

export function DepositsScreen({
  manual,
  filter,
  rows,
  total,
  page,
  pageSize,
  open,
  amlMaxRisk,
}: {
  manual: boolean
  filter: DepositFilter
  rows: DepositRow[]
  total: number
  page: number
  pageSize: number
  open: DepositDetail | null
  amlMaxRisk: number
}) {
  const { locale, t } = useI18n()
  const { isAllCompanies, operator } = useAdmin()
  const params = useListParams()

  const statusOptions: SelectOption[] = STATUS_KEYS.map((option) => ({
    value: option.value,
    label: t(option.key),
  }))

  return (
    <AdminShell
      title={manual ? t('admin.deposits.title') : t('admin.deposits.historyTitle')}
      note={manual ? t('admin.deposits.note') : t('admin.deposits.historyNote')}
    >
      {manual ? (
        <Toast
          tone="warning"
          title={t('admin.deposits.manualTitle')}
          text={t('admin.deposits.manualText')}
        />
      ) : null}

      <div className={styles.filters}>
        <div className={styles.filterGrow}>
          <Input
            label={t('admin.deposits.searchLabel')}
            placeholder={t('admin.users.searchPlaceholder')}
            defaultValue={params.get('q')}
            onChange={(e) => params.set({ q: e.target.value })}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.col.status')}
            options={statusOptions}
            value={filter}
            onChange={(next) => params.set({ status: next })}
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
                <TH>{t('admin.deposits.col.source')}</TH>
                <TH>{t('admin.deposits.col.aml')}</TH>
                <TH>{t('admin.deposits.col.tx')}</TH>
                <TH>{t('admin.deposits.col.age')}</TH>
                <TH align="actions">{t('admin.col.action')}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((deposit) => (
                <TR
                  key={deposit.id}
                  /* Помечаются строки, которые придётся разбирать
                     руками: непройденная проверка и заявка без ссылки
                     на транзакцию. */
                  flagged={deposit.amlVerdict === 'FAILED' || !deposit.txLink}
                  onClick={() => params.set({ open: deposit.id })}
                >
                  <TD primary>{deposit.userName}</TD>
                  {isAllCompanies ? <TD muted>{deposit.companyName}</TD> : null}
                  <TD align="numeric">
                    <Amount value={deposit.amount} currency="USD" size="caption" />
                  </TD>
                  <TD muted>
                    {deposit.network} · {deposit.asset}
                  </TD>
                  <TD muted>
                    {deposit.source === 'SYSTEM'
                      ? t('admin.deposits.source.auto')
                      : t('admin.deposits.source.manual')}
                  </TD>
                  <TD>
                    {deposit.amlVerdict === null ? (
                      <span className={styles.company}>—</span>
                    ) : (
                      <div className={styles.statusBlock}>
                        <Badge tone={AML_TONE[deposit.amlVerdict] ?? 'neutral'}>
                          {t(`admin.deposits.aml.${AML_KEY[deposit.amlVerdict] ?? 'pending'}`)}
                        </Badge>
                        {deposit.amlRisk === null ? null : (
                          <span className={styles.company}>
                            {t('admin.deposits.risk', { value: deposit.amlRisk })}
                          </span>
                        )}
                      </div>
                    )}
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
                      {/* Заявку уже разбирает ДРУГОЙ оператор. Пометка
                          стоит на месте кнопки, а не рядом с ней:
                          именно сюда смотрят перед тем, как открыть.
                          Свой собственный захват кнопку не прячет —
                          иначе оператор не сможет вернуться к заявке,
                          которую сам же и открыл. */}
                      {deposit.claimedBy && deposit.claimedBy !== operator.id ? (
                        <Badge tone="warning">
                          {t('admin.deposits.claimedBy', {
                            name: deposit.claimedByName ?? deposit.claimedBy,
                          })}
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => params.set({ open: deposit.id })}
                        >
                          {t('admin.action.open')}
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Pager page={page} pageSize={pageSize} total={total} onPage={params.setPage} />

      <DepositDrawer
        deposit={open}
        amlMaxRisk={amlMaxRisk}
        onClose={() => params.set({ open: '' })}
      />
    </AdminShell>
  )
}

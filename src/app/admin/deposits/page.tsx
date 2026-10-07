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
  Toast,
} from '@/ui'
import type { SelectOption } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { useDemoState } from '@/fixtures/demoState'
import { companyName } from '@/fixtures/admin'
import { CREDITING, DEPOSITS } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from '../AdminShell'
import { Pager, pageSlice } from '../_components/Pager'
import { DepositDrawer } from './_components/DepositDrawer'
import styles from '../admin.module.css'

const PAGE_SIZE = 10

const STATUS_KEYS: { value: string; key: string }[] = [
  { value: 'SUBMITTED', key: 'admin.deposits.status.submitted' },
  /* Удержанные — отдельным фильтром и первыми после очереди: это деньги,
     которые пришли, но не зачислены, и ждут они решения человека. */
  { value: 'HELD', key: 'admin.deposits.status.held' },
  { value: 'CREDITED', key: 'admin.deposits.status.credited' },
  { value: 'REJECTED', key: 'admin.deposits.status.rejected' },
  { value: 'REFUNDED', key: 'admin.deposits.status.refunded' },
  { value: 'all', key: 'admin.tx.status.all' },
]

export default function DepositsPage() {
  const { locale, t } = useI18n()
  const { byCompany, isAllCompanies } = useAdmin()
  const demo = useDemoState()

  /* Режим решает, чем является этот экран.

     Автозачисление включено — это история: система зачисляет сама, и
     оператору остаётся смотреть, что произошло. Выключено — это очередь,
     и каждая строка ждёт решения человека.

     Поэтому и фильтр по умолчанию разный: в истории «все», в очереди
     «ожидают». Показывать оператору пустой экран с надписью «заявок нет»,
     когда за день прошли сотни зачислений, бессмысленно. */
  const manual = demo === 'manual' ? true : !CREDITING.auto

  const [status, setStatus] = useState(manual ? 'SUBMITTED' : 'all')
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
                    /* Помечаются строки, которые придётся разбирать руками:
                       непройденный AML и заявка без ссылки на транзакцию. */
                    flagged={deposit.amlVerdict === 'fail' || !deposit.txLink}
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
                    {/* Откуда взялась заявка: пришла сама на выданный адрес
                        или заведена оператором руками. */}
                    <TD muted>
                      {deposit.source === 'auto'
                        ? t('admin.deposits.source.auto')
                        : t('admin.deposits.source.manual')}
                    </TD>
                    <TD>
                      {deposit.amlVerdict === null ? (
                        <span className={styles.company}>—</span>
                      ) : (
                        <div className={styles.statusBlock}>
                          <Badge
                            tone={
                              deposit.amlVerdict === 'pass'
                                ? 'success'
                                : deposit.amlVerdict === 'fail'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {t(`admin.deposits.aml.${deposit.amlVerdict}`)}
                          </Badge>
                          {deposit.amlRisk ? (
                            <span className={styles.company}>
                              {t('admin.deposits.risk', { value: deposit.amlRisk })}
                            </span>
                          ) : null}
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
                        {/* Заявку уже разбирает другой оператор. Пометка
                            стоит на месте кнопки, а не рядом с ней:
                            именно сюда смотрят перед тем, как открыть. */}
                        {deposit.claimedBy ? (
                          <Badge tone="warning">
                            {t('admin.deposits.claimedBy', { name: deposit.claimedBy })}
                          </Badge>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => setOpenId(deposit.id)}>
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

      <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />

      <DepositDrawer depositId={openId} onClose={() => setOpenId(null)} />
    </AdminShell>
  )
}

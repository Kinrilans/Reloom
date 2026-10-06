'use client'

import { CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react'
import { Amount, Badge, Button, Card, CardHeader, TBody, TD, TH, THead, TR, Table, Toast } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { SYSTEM } from '@/fixtures/admin'
import { AdminShell } from '../AdminShell'
import styles from '../admin.module.css'

/**
 * Состояние системы.
 *
 * Технический экран для разбора проблем. Для каждой проблемы написано,
 * что это значит и что делать: этот экран читает человек в стрессе.
 */
export default function SystemPage() {
  const { locale, t } = useI18n()

  return (
    <AdminShell
      title={t('admin.system.title')}
      note={t('admin.system.note')}
      action={
        <Button variant="secondary" iconStart={<RefreshCw size={16} />}>
          {t('admin.system.refresh')}
        </Button>
      }
    >
      <div className={styles.grid4}>
        <Card density="dense">
          <div className={styles.kpiLabel}>{t('admin.system.lag')}</div>
          <Amount value={SYSTEM.eventLagSeconds} currency={t('admin.unit.seconds')} size="kpi" />
          <p className={styles.kpiHint}>{t('admin.system.lagHint')}</p>
        </Card>

        <Card density="dense">
          <div className={styles.kpiLabel}>{t('admin.system.unprocessed')}</div>
          <Amount value={SYSTEM.unprocessedEvents} currency="" size="kpi" />
          <p className={styles.kpiHint}>{t('admin.system.unprocessedHint')}</p>
        </Card>

        <Card density="dense">
          <div className={styles.kpiLabel}>{t('admin.system.lastPoolRead')}</div>
          <div className={styles.kpiValue}>{formatDateTime(locale, SYSTEM.lastPoolRead)}</div>
          <p className={styles.kpiHint}>{t('admin.system.lastPoolReadHint')}</p>
        </Card>

        <Card density="dense">
          <div className={styles.kpiLabel}>{t('admin.system.throttling')}</div>
          <div className={styles.kpiValue}>
            {SYSTEM.throttling ? (
              <Badge tone="danger" solid>
                {t('admin.dashboard.throttlingOn')}
              </Badge>
            ) : (
              <Badge tone="success">{t('admin.dashboard.throttlingOff')}</Badge>
            )}
          </div>
          <p className={styles.kpiHint}>{t('admin.system.throttlingHint')}</p>
        </Card>
      </div>

      <div className={styles.split}>
        <div className={styles.stack}>
          <Card density="dense">
            <CardHeader
              title={t('admin.system.transfersTitle')}
              subtitle={t('admin.system.transfersSubtitle')}
            />
            <Table>
              <THead>
                <TR>
                  <TH>{t('admin.col.user')}</TH>
                  <TH align="numeric">{t('admin.tx.col.amount')}</TH>
                  <TH>{t('admin.system.col.state')}</TH>
                  <TH>{t('admin.system.col.started')}</TH>
                </TR>
              </THead>
              <TBody>
                {SYSTEM.pendingTransfers.map((t) => (
                  <TR key={t.id} flagged>
                    <TD primary>{t.userName}</TD>
                    <TD align="numeric">
                      <Amount value={t.amount} currency="USD" size="caption" />
                    </TD>
                    <TD muted>
                      <span className={styles.mono}>{t.state}</span>
                    </TD>
                    <TD muted>{formatDateTime(locale, t.at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className={styles.kpiHint}>{t('admin.system.transfersHint')}</p>
          </Card>

          <Card density="dense">
            <CardHeader
              title={t('admin.system.stuckTitle')}
              subtitle={t('admin.system.stuckSubtitle')}
            />
            <Table>
              <THead>
                <TR>
                  <TH>{t('admin.col.action')}</TH>
                  <TH>requestId</TH>
                  <TH>{t('admin.system.col.when')}</TH>
                </TR>
              </THead>
              <TBody>
                {SYSTEM.stuckCalls.map((c) => (
                  <TR key={c.id} flagged>
                    <TD primary>
                      <span className={styles.mono}>{c.action}</span>
                    </TD>
                    <TD muted>
                      <span className={styles.mono}>{c.requestId}</span>
                    </TD>
                    <TD muted>{formatDateTime(locale, c.at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className={styles.kpiHint}>{t('admin.system.stuckHint')}</p>
          </Card>

          <Card density="dense">
            <CardHeader title={t('admin.system.errorsTitle')} />
            <Table>
              <THead>
                <TR>
                  <TH>{t('admin.system.col.code')}</TH>
                  <TH>requestId</TH>
                  <TH>{t('admin.system.col.when')}</TH>
                </TR>
              </THead>
              <TBody>
                {SYSTEM.errors.map((e) => (
                  <TR key={e.id}>
                    <TD primary>
                      <span className={styles.mono}>{e.code}</span>
                    </TD>
                    <TD muted>
                      <span className={styles.mono}>{e.requestId}</span>
                    </TD>
                    <TD muted>{formatDateTime(locale, e.at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className={styles.kpiHint}>{t('admin.system.errorsHint')}</p>
          </Card>
        </div>

        <Card density="dense">
          <CardHeader title={t('admin.system.reconTitle')} />
          <div className={styles.stackTight}>
            {SYSTEM.reconciliation.map((r) => (
              <div className={styles.statusBlock} key={r.id}>
                {r.ok ? (
                  <Badge tone="success" icon={<CircleCheck size={12} />} dot={false}>
                    {t('admin.system.reconOk')}
                  </Badge>
                ) : (
                  <Badge tone="danger" icon={<TriangleAlert size={12} />} dot={false}>
                    {t('admin.system.reconFail')}
                  </Badge>
                )}
                <span className={styles.statusTitle}>{t(`admin.recon.${r.code}.title`)}</span>
                <p className={styles.company}>{t(`admin.recon.${r.code}.result`)}</p>
              </div>
            ))}
          </div>

          <Toast
            tone="neutral"
            title={t('admin.system.sourceTitle')}
            text={t('admin.system.sourceText')}
          />
        </Card>
      </div>
    </AdminShell>
  )
}

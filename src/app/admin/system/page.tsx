'use client'

import Link from 'next/link'
import { ArrowUpRight, CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react'
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
                  <TH align="actions">{t('admin.col.action')}</TH>
                </TR>
              </THead>
              <TBody>
                {SYSTEM.pendingTransfers.map((row) => (
                  <TR key={row.id} flagged>
                    <TD primary>{row.userName}</TD>
                    <TD align="numeric">
                      <Amount value={row.amount} currency="USD" size="caption" />
                    </TD>
                    <TD muted>
                      <span className={styles.mono}>{row.state}</span>
                    </TD>
                    <TD muted>{formatDateTime(locale, row.at)}</TD>
                    {/* Переход к самому пользователю: список проблем без
                        перехода к проблеме заставляет искать её руками. */}
                    <TD align="actions">
                      <div className={styles.actionsCell}>
                        <Link href={`/admin/users/${row.userId}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label={t('admin.system.goToUser')}
                            title={t('admin.system.goToUser')}
                            iconStart={<ArrowUpRight size={16} />}
                          />
                        </Link>
                      </div>
                    </TD>
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
                  <TH align="actions">{t('admin.col.action')}</TH>
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
                    {/* Разбор зависшего вызова начинается с журнала обмена:
                        там лежит, что мы отправили и что получили. */}
                    <TD align="actions">
                      <div className={styles.actionsCell}>
                        <Link href={`/admin/exchange?request=${c.requestId}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label={t('admin.system.goToExchange')}
                            title={t('admin.system.goToExchange')}
                            iconStart={<ArrowUpRight size={16} />}
                          />
                        </Link>
                      </div>
                    </TD>
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
                  <TH align="actions">{t('admin.col.action')}</TH>
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
                    <TD align="actions">
                      <div className={styles.actionsCell}>
                        <Link href={`/admin/exchange?request=${e.requestId}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label={t('admin.system.goToExchange')}
                            title={t('admin.system.goToExchange')}
                            iconStart={<ArrowUpRight size={16} />}
                          />
                        </Link>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className={styles.kpiHint}>{t('admin.system.errorsHint')}</p>
          </Card>
        </div>

        {/* Внешние сервисы. Автозачисление держится на двух из них, и
            когда один молчит, деньги просто перестают зачисляться —
            оператор должен узнать об этом здесь, а не из обращений.

            Ключей доступа на экране нет и не будет: они живут в переменных
            окружения (CLAUDE.md, правило 7). Оператору нужно знать, что
            сервис отвечает, а не чем мы к нему подключаемся. */}
        <Card density="dense">
          <CardHeader
            title={t('admin.system.servicesTitle')}
            subtitle={t('admin.system.servicesSubtitle')}
          />
          <div className={styles.stackTight}>
            {SYSTEM.services.map((s) => (
              <div className={styles.statusBlock} key={s.id}>
                {s.ok ? (
                  <Badge tone="success" icon={<CircleCheck size={12} />} dot={false}>
                    {t('admin.system.serviceOk')}
                  </Badge>
                ) : (
                  <Badge tone="danger" icon={<TriangleAlert size={12} />} dot={false}>
                    {t('admin.system.serviceDown')}
                  </Badge>
                )}
                <span className={styles.statusTitle}>{t(`admin.service.${s.code}`)}</span>
                {/* Узел — данные, он не переводится. */}
                <p className={styles.company}>
                  {s.host} · {t('admin.system.lastCall', { at: formatDateTime(locale, s.lastAt) })}
                </p>
                {s.noteCode ? (
                  <p className={styles.company}>{t(`admin.service.note.${s.noteCode}`)}</p>
                ) : null}
              </div>
            ))}
          </div>
          <p className={styles.kpiHint}>{t('admin.system.keysHint')}</p>
        </Card>

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

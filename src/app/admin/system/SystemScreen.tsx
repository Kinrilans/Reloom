'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { ArrowUpRight, CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react'
import {
  Amount,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Toast,
} from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type { SystemView } from '@/server/admin/system'
import { AdminShell } from '../AdminShell'
import { useAdmin } from '../_store/AdminStore'
import { refreshPoolsAction } from '../actions'
import styles from '../admin.module.css'

/**
 * Состояние системы.
 *
 * Для каждой проблемы написано, что это значит и что делать: этот
 * экран читает человек в стрессе.
 *
 * Отставание догона показано двумя числами, и путать их нельзя.
 * «Давно не читали страницы» означает, что мы не узнаём о тратах —
 * возможно, упал воркер. «События приходят, но не применяются»
 * означает ошибку в обработчике. Лечатся они по-разному.
 *
 * Ключей доступа здесь нет и не будет: они живут в переменных
 * окружения (CLAUDE.md, правило 7). Оператору нужно знать, отвечает
 * сервис или нет, а не чем мы к нему подключаемся.
 */
export function SystemScreen({ view }: { view: SystemView }) {
  const { locale, t } = useI18n()
  const { can } = useAdmin()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <AdminShell
      title={t('admin.system.title')}
      note={t('admin.system.note')}
      action={
        can('APPROVE_DEPOSITS') ? (
          <Button
            variant="secondary"
            iconStart={<RefreshCw size={16} />}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await refreshPoolsAction()
                router.refresh()
              })
            }
          >
            {t('admin.system.refresh')}
          </Button>
        ) : null
      }
    >
      {view.catchupError ? (
        <Toast
          tone="danger"
          title={t('admin.system.catchupErrorTitle')}
          text={view.catchupError}
        />
      ) : null}

      <div className={styles.grid4}>
        <Card density="dense">
          <div className={styles.kpiLabel}>{t('admin.system.lag')}</div>
          {view.eventLagSeconds === null ? (
            <div className={styles.kpiValue}>{t('admin.dashboard.never')}</div>
          ) : (
            <Amount
              value={String(view.eventLagSeconds)}
              currency={t('admin.unit.seconds')}
              size="kpi"
            />
          )}
          <p className={styles.kpiHint}>{t('admin.system.lagHint')}</p>
        </Card>

        <Card density="dense">
          <div className={styles.kpiLabel}>{t('admin.system.unprocessed')}</div>
          <Amount value={String(view.unprocessedEvents)} currency="" size="kpi" />
          <p className={styles.kpiHint}>
            {view.failingEvents > 0
              ? t('admin.system.failingHint', { count: view.failingEvents })
              : t('admin.system.unprocessedHint')}
          </p>
        </Card>

        <Card density="dense">
          <div className={styles.kpiLabel}>{t('admin.system.lastPoolRead')}</div>
          <div className={styles.kpiValue}>
            {view.lastPoolRead
              ? formatDateTime(locale, view.lastPoolRead)
              : t('admin.dashboard.never')}
          </div>
          <p className={styles.kpiHint}>{t('admin.system.lastPoolReadHint')}</p>
        </Card>

        <Card density="dense">
          <div className={styles.kpiLabel}>{t('admin.system.throttling')}</div>
          <div className={styles.kpiValue}>
            {view.throttling ? (
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
            {view.pendingTransfers.length === 0 ? (
              <p className={styles.muted}>{t('admin.system.noTransfers')}</p>
            ) : (
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
                  {view.pendingTransfers.map((row) => (
                    <TR key={row.id} flagged>
                      <TD primary>{row.userName}</TD>
                      <TD align="numeric">
                        <Amount value={row.amount} currency="USD" size="caption" />
                      </TD>
                      <TD muted>
                        <span className={styles.mono}>{row.status}</span>
                      </TD>
                      <TD muted>{formatDateTime(locale, row.at)}</TD>
                      {/* Переход к самому пользователю: список проблем
                          без перехода к проблеме заставляет искать её
                          руками. */}
                      <TD align="actions">
                        <div className={styles.actionsCell}>
                          <Link href={`/admin/users?open=${row.userId}&filter=all`}>
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
            )}
            <p className={styles.kpiHint}>{t('admin.system.transfersHint')}</p>
          </Card>

          <Card density="dense">
            <CardHeader
              title={t('admin.system.stuckTitle')}
              subtitle={t('admin.system.stuckSubtitle')}
            />
            {view.stuckCalls.length === 0 ? (
              <p className={styles.muted}>{t('admin.system.noStuck')}</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>{t('admin.col.action')}</TH>
                    <TH>{t('admin.system.col.subject')}</TH>
                    <TH>requestId</TH>
                    <TH>{t('admin.system.col.when')}</TH>
                    <TH align="actions">{t('admin.col.action')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {view.stuckCalls.map((call) => (
                    <TR key={call.key} flagged>
                      <TD primary>
                        <span className={styles.mono}>{call.action}</span>
                      </TD>
                      <TD muted>
                        <span className={styles.mono}>
                          {call.subjectType} {call.subjectId}
                        </span>
                      </TD>
                      <TD muted>
                        <span className={styles.mono}>{call.requestId ?? '—'}</span>
                      </TD>
                      <TD muted>{formatDateTime(locale, call.at)}</TD>
                      {/* Разбор зависшего вызова начинается с журнала
                          обмена: там лежит, что мы отправили и что
                          получили. */}
                      <TD align="actions">
                        <div className={styles.actionsCell}>
                          <Link
                            href={`/admin/exchange?${
                              call.requestId ? `request=${call.requestId}` : `q=${call.subjectId}`
                            }`}
                          >
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
            )}
            <p className={styles.kpiHint}>{t('admin.system.stuckHint')}</p>
          </Card>

          <Card density="dense">
            <CardHeader title={t('admin.system.errorsTitle')} />
            {view.errors.length === 0 ? (
              <p className={styles.muted}>{t('admin.system.noErrors')}</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>{t('admin.system.col.service')}</TH>
                    <TH>{t('admin.system.col.code')}</TH>
                    <TH>requestId</TH>
                    <TH>{t('admin.system.col.when')}</TH>
                    <TH align="actions">{t('admin.col.action')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {view.errors.map((error) => (
                    <TR key={error.id}>
                      <TD muted>{t(`admin.service.${serviceKey(error.service)}`)}</TD>
                      <TD primary>
                        <span className={styles.mono}>{error.code}</span>
                      </TD>
                      <TD muted>
                        <span className={styles.mono}>{error.requestId ?? '—'}</span>
                      </TD>
                      <TD muted>{formatDateTime(locale, error.at)}</TD>
                      <TD align="actions">
                        <div className={styles.actionsCell}>
                          <Link
                            href={`/admin/exchange?${
                              error.requestId
                                ? `request=${error.requestId}`
                                : `service=${error.service}&outcome=FAILED`
                            }`}
                          >
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
            )}
            <p className={styles.kpiHint}>{t('admin.system.errorsHint')}</p>
          </Card>
        </div>

        <div className={styles.stack}>
          {/* Внешние сервисы. Автозачисление держится на двух из них, и
              когда один молчит, деньги просто перестают зачисляться —
              оператор должен узнать об этом здесь, а не из обращений. */}
          <Card density="dense">
            <CardHeader
              title={t('admin.system.servicesTitle')}
              subtitle={t('admin.system.servicesSubtitle')}
            />
            <div className={styles.stackTight}>
              {view.services.map((service) => (
                <div className={styles.statusBlock} key={service.code}>
                  {service.ok ? (
                    <Badge tone="success" icon={<CircleCheck size={12} />} dot={false}>
                      {t('admin.system.serviceOk')}
                    </Badge>
                  ) : (
                    <Badge tone="danger" icon={<TriangleAlert size={12} />} dot={false}>
                      {t('admin.system.serviceDown')}
                    </Badge>
                  )}
                  <span className={styles.statusTitle}>{t(`admin.service.${service.code}`)}</span>
                  {/* Узел — данные, он не переводится. */}
                  <p className={styles.company}>
                    {service.host} ·{' '}
                    {service.lastAt
                      ? t('admin.system.lastCall', { at: formatDateTime(locale, service.lastAt) })
                      : t('admin.system.neverCalled')}
                  </p>
                  {service.lastError ? (
                    <p className={styles.company}>{service.lastError}</p>
                  ) : null}
                </div>
              ))}
            </div>
            <p className={styles.kpiHint}>{t('admin.system.keysHint')}</p>
          </Card>

          {/* Сверки появляются на этапе устойчивости. Показывать здесь
              выдуманный результат нельзя: экран читают, когда ищут
              расхождение, и «всё в порядке» без сверки — худшее, что
              он может сказать. */}
          <Card density="dense">
            <CardHeader title={t('admin.system.reconTitle')} />
            <EmptyState
              icon={<CircleCheck size={24} />}
              title={t('admin.system.reconEmptyTitle')}
              text={t('admin.system.reconEmptyText')}
            />
          </Card>
        </div>
      </div>
    </AdminShell>
  )
}

/** Код сервиса в терминах интерфейса. */
function serviceKey(service: string): string {
  if (service === 'WALLET') return 'addresses'
  if (service === 'AML') return 'aml'
  return 'oxen'
}

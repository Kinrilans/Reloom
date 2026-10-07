'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, TriangleAlert } from 'lucide-react'
import {
  Amount,
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  Input,
  Modal,
  Select,
  Textarea,
  Toast,
} from '@/ui'
import type { SelectOption } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { CREDITING, DEPOSITS, FEES, USERS, companyName } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import styles from '../../admin.module.css'

/**
 * Карточка заявки на пополнение — боковой панелью из списка.
 *
 * Отдельной страницей она сбивала: оператор разбирает очередь подряд и
 * терял место в списке на каждой заявке.
 *
 * Подтверждение — самое ответственное действие в админке. Поэтому:
 * - сумма вводится ФАКТИЧЕСКИ ПОЛУЧЕННАЯ, а не заявленная: приходит
 *   столько, сколько пришло;
 * - итог к зачислению показывается крупно ДО нажатия кнопки;
 * - переопределение комиссии требует обязательной причины.
 *
 * Никакой арифметики здесь нет: итог берётся готовым из демо-данных.
 * Расчёт комиссии и проводка появятся на этапе 1 вместе с леджером.
 */

/** Готовый список причин отклонения. Нужен потому, что пользователь может
 *  читать интерфейс по-английски: пункты списка переводятся словарём,
 *  а свободный текст — нет (docs/i18n.md). */
const REJECT_REASON_CODES = ['not-found', 'mismatch', 'no-link', 'other']

export interface DepositDrawerProps {
  depositId: string | null
  onClose: () => void
}

export function DepositDrawer({ depositId, onClose }: DepositDrawerProps) {
  const { locale, t } = useI18n()
  const { can } = useAdmin()

  const deposit = DEPOSITS.find((d) => d.id === depositId)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [refunded, setRefunded] = useState(false)
  const [overrideFee, setOverrideFee] = useState(false)
  const [done, setDone] = useState<'credited' | 'rejected' | null>(null)
  const [received, setReceived] = useState('')

  // Следующая заявка открывается с чистого состояния: иначе на ней
  // остаётся сумма и исход предыдущей.
  useEffect(() => {
    setConfirmOpen(false)
    setRejectOpen(false)
    setRefundOpen(false)
    setRefunded(false)
    setOverrideFee(false)
    setDone(null)
    setReceived(deposit?.declared ?? '')
  }, [depositId, deposit?.declared])

  const user = USERS.find((u) => u.id === deposit?.userId)
  const history = DEPOSITS.filter((d) => d.userId === deposit?.userId && d.id !== deposit?.id)
  const mayApprove = can('APPROVE_DEPOSITS')

  const rejectReasons: SelectOption[] = REJECT_REASON_CODES.map((code) => ({
    value: code,
    label: t(`admin.reject.${code}`),
  }))

  return (
    <>
      <Drawer
        open={deposit !== undefined}
        onClose={onClose}
        title={
          deposit
            ? t('admin.depDrawer.title', { name: deposit.userName })
            : t('admin.depDrawer.fallback')
        }
        subtitle={deposit ? companyName(deposit.companyId) : undefined}
        footer={
          /* Интерфейс скрывает недоступные действия, а не показывает их
             неактивными: иначе оператор тратит время на то, чего не может. */
          mayApprove && !done ? (
            <>
              <Button variant="secondary" onClick={() => setRejectOpen(true)}>
                {t('admin.depDrawer.reject')}
              </Button>
              <Button onClick={() => setConfirmOpen(true)}>{t('admin.depDrawer.approve')}</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              {t('admin.profile.close')}
            </Button>
          )
        }
      >
        {deposit ? (
          <>
            {done === 'credited' ? (
              <Toast
                tone="success"
                title={t('admin.depDrawer.creditedTitle')}
                text={t('admin.depDrawer.creditedText')}
              />
            ) : null}
            {done === 'rejected' ? (
              <Toast
                tone="neutral"
                title={t('admin.depDrawer.rejectedTitle')}
                text={t('admin.depDrawer.rejectedText')}
              />
            ) : null}

            {!mayApprove ? (
              <Toast
                tone="neutral"
                title={t('admin.depDrawer.readOnlyTitle')}
                text={t('admin.depDrawer.readOnlyText')}
              />
            ) : null}

            {/* Заявка занята другим оператором. Предупреждение, а не
                запрет: запрет держится на сервере (docs/flows-admin.md),
                здесь задача проще — чтобы двое не начали разбирать одно
                и то же, не зная друг о друге. */}
            {deposit.claimedBy ? (
              <Toast
                tone="warning"
                title={t('admin.depDrawer.claimedTitle', { name: deposit.claimedBy })}
                text={t('admin.depDrawer.claimedText')}
              />
            ) : null}

            <Card density="dense">
              <CardHeader title={t('admin.depDrawer.requestCard')} />
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.col.user')}</span>
                  <span className={styles.rowValue}>
                    <Link href={`/admin/users/${deposit.userId}`}>{deposit.userName}</Link>
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.depDrawer.balance')}</span>
                  <span className={styles.rowValue}>
                    <Amount value={user?.balance ?? '0.00'} currency="USD" size="caption" />
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.depDrawer.declared')}</span>
                  <span className={styles.rowValue}>
                    <Amount value={deposit.declared} currency="USD" size="caption" />
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.depDrawer.network')}</span>
                  <span className={styles.rowValue}>
                    {deposit.network} · {deposit.asset}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.depDrawer.submitted')}</span>
                  <span className={styles.rowValue}>
                    {formatDateTime(locale, deposit.createdAt)}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.depDrawer.tx')}</span>
                  <span className={styles.rowValue}>
                    {deposit.txLink ? (
                      <a href={deposit.txLink} target="_blank" rel="noreferrer">
                        {t('admin.depDrawer.openChain')} <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className={styles.flagCell}>
                        <TriangleAlert size={14} /> {t('admin.depDrawer.noLink')}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </Card>

            {/* Проверка AML. Стоит до истории и до «что произойдёт»:
                пока вердикт не ясен, остальное не имеет значения.

                Оценку риска даёт внешний сервис. Мы её не считаем и не
                пересчитываем — только сравниваем с порогом из настроек
                (docs/prototype.md). */}
            {deposit.amlVerdict ? (
              <Card density="dense">
                <CardHeader
                  title={t('admin.depDrawer.amlTitle')}
                  subtitle={t('admin.depDrawer.amlSubtitle', {
                    limit: CREDITING.amlMaxRisk,
                  })}
                  action={
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
                  }
                />
                <div className={styles.rows}>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>{t('admin.depDrawer.risk')}</span>
                    <span className={styles.rowValue}>{deposit.amlRisk ?? '—'}</span>
                  </div>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>{t('admin.depDrawer.toAddress')}</span>
                    <span className={[styles.rowValue, styles.mono].join(' ')}>
                      {deposit.address ?? '—'}
                    </span>
                  </div>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>{t('admin.depDrawer.fromAddress')}</span>
                    <span className={[styles.rowValue, styles.mono].join(' ')}>
                      {deposit.fromAddress ?? '—'}
                    </span>
                  </div>
                </div>

                {deposit.amlVerdict === 'fail' ? (
                  <div className={styles.stack}>
                    <Toast
                      tone="danger"
                      title={t('admin.depDrawer.heldTitle')}
                      text={t('admin.depDrawer.heldText')}
                    />
                    {/* Возврат запускает сам пользователь из приложения,
                        и это не послабление правила «деньги наружу — через
                        оператора». Средства в систему не зачислялись: они
                        лежат на крипто-адресе, в леджере их нет, и вернуть
                        их можно ровно на один адрес — тот, с которого они
                        пришли. Выбора получателя нет, значит нет и решения,
                        которое должен принимать человек.

                        Оператору кнопка оставлена на случай, когда
                        пользователь не отвечает: деньги не могут висеть
                        на адресе вечно. */}
                    {deposit.refund === 'requested' ? (
                      <Toast
                        tone="neutral"
                        title={t('admin.depDrawer.refundRequestedTitle')}
                        text={t('admin.depDrawer.refundRequestedText')}
                      />
                    ) : (
                      <Toast
                        tone="neutral"
                        title={t('admin.depDrawer.refundWaitTitle')}
                        text={t('admin.depDrawer.refundWaitText')}
                      />
                    )}
                    {mayApprove && refunded !== true ? (
                      <Button variant="secondary" onClick={() => setRefundOpen(true)}>
                        {t('admin.depDrawer.refund')}
                      </Button>
                    ) : null}
                    {refunded ? (
                      <Toast
                        tone="success"
                        title={t('admin.depDrawer.refundSentTitle')}
                        text={t('admin.depDrawer.refundSentText')}
                      />
                    ) : null}
                  </div>
                ) : null}
              </Card>
            ) : null}

            <Card density="dense">
              <CardHeader
                title={t('admin.depDrawer.historyTitle')}
                subtitle={t('admin.depDrawer.historySubtitle')}
              />
              {history.length === 0 ? (
                <p className={styles.muted}>{t('admin.depDrawer.noHistory')}</p>
              ) : (
                <div className={styles.rows}>
                  {history.map((h) => (
                    <div className={styles.row} key={h.id}>
                      <span className={styles.rowLabel}>{formatDateTime(locale, h.createdAt)}</span>
                      <span className={styles.rowValue}>
                        <Amount value={h.declared} currency="USD" size="caption" />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card density="dense">
              <CardHeader title={t('admin.depDrawer.willHappen')} />
              <ol className={styles.muted}>
                <li>{t('admin.depDrawer.step1')}</li>
                <li>{t('admin.depDrawer.step2')}</li>
                <li>{t('admin.depDrawer.step3')}</li>
                <li>{t('admin.depDrawer.step4')}</li>
                <li>{t('admin.depDrawer.step5')}</li>
              </ol>
              <p className={styles.kpiHint}>{t('admin.depDrawer.noCardsHint')}</p>
            </Card>
          </>
        ) : null}
      </Drawer>

      {/* --- Подтверждение ---------------------------------------------- */}
      <Modal
        open={confirmOpen && deposit !== undefined}
        onClose={() => setConfirmOpen(false)}
        title={t('admin.depDrawer.confirmTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              {t('admin.depDrawer.cancel')}
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false)
                setDone('credited')
              }}
            >
              {t('admin.depDrawer.credit')}
            </Button>
          </>
        }
      >
        {deposit ? (
          <div className={styles.stack}>
            <Input
              label={t('admin.depDrawer.received')}
              numeric
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              hint={t('admin.depDrawer.receivedHint')}
            />

            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.depDrawer.feeLabel')}</span>
                <span className={styles.rowValue}>
                  {t('admin.depDrawer.feeValue', {
                    bps: FEES.deposit.bps,
                    fixed: FEES.deposit.fixed,
                  })}
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.fees.weHold')}</span>
                <span className={styles.rowValue}>
                  <Amount value={deposit.fee} currency="USD" size="caption" />
                </span>
              </div>
              <div className={[styles.row, styles.rowTotal].join(' ')}>
                <span className={styles.rowLabel}>{t('admin.fees.toCredit')}</span>
                <span className={styles.rowValue}>
                  <Amount value={deposit.net} currency="USD" size="kpi" />
                </span>
              </div>
            </div>

            <Button variant="ghost" size="sm" onClick={() => setOverrideFee((v) => !v)}>
              {overrideFee ? t('admin.depDrawer.keepRate') : t('admin.depDrawer.overrideRate')}
            </Button>

            {overrideFee ? (
              <>
                <Input
                  label={t('admin.depDrawer.overrideBps')}
                  numeric
                  defaultValue={FEES.deposit.bps}
                />
                <Textarea
                  label={t('admin.depDrawer.overrideReason')}
                  required
                  placeholder={t('admin.depDrawer.overrideReasonPlaceholder')}
                />
              </>
            ) : null}

            {/* Минимум пополнения — предупреждение, а не блокировка: деньги
                уже пришли, отказывать их зачислять нельзя. */}
            <Toast
              tone="neutral"
              title={t('admin.depDrawer.minTitle', { amount: FEES.minDeposit })}
              text={t('admin.depDrawer.minText')}
            />
          </div>
        ) : null}
      </Modal>

      {/* --- Возврат отправителю ----------------------------------------- */}
      <Modal
        open={refundOpen && deposit !== undefined}
        onClose={() => setRefundOpen(false)}
        title={t('admin.depDrawer.refundTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefundOpen(false)}>
              {t('admin.depDrawer.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setRefundOpen(false)
                setRefunded(true)
              }}
            >
              {t('admin.depDrawer.refundConfirm')}
            </Button>
          </>
        }
      >
        {deposit ? (
          <div className={styles.stack}>
            <Toast
              tone="warning"
              title={t('admin.depDrawer.refundWarnTitle')}
              text={t('admin.depDrawer.refundWarnText')}
            />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.depDrawer.refundAmount')}</span>
                <span className={styles.rowValue}>
                  <Amount value={deposit.declared} currency={deposit.asset} size="caption" />
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.depDrawer.networkFee')}</span>
                <span className={styles.rowValue}>
                  {deposit.refundFee ? (
                    <Amount value={deposit.refundFee} currency={deposit.asset} size="caption" />
                  ) : (
                    '—'
                  )}
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.depDrawer.fromAddress')}</span>
                <span className={[styles.rowValue, styles.mono].join(' ')}>
                  {deposit.fromAddress ?? '—'}
                </span>
              </div>
            </div>
            {/* Адрес после возврата не живёт: он засвечен в той же цепочке,
                и следующее поступление притащит ту же историю. */}
            <Toast
              tone="neutral"
              title={t('admin.depDrawer.burnTitle')}
              text={t('admin.depDrawer.burnText')}
            />
          </div>
        ) : null}
      </Modal>

      {/* --- Отклонение ------------------------------------------------- */}
      <Modal
        open={rejectOpen && deposit !== undefined}
        onClose={() => setRejectOpen(false)}
        title={t('admin.depDrawer.rejectTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>
              {t('admin.depDrawer.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setRejectOpen(false)
                setDone('rejected')
              }}
            >
              {t('admin.depDrawer.reject')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <Select
            label={t('admin.depDrawer.reason')}
            options={rejectReasons}
            defaultValue="not-found"
            hint={t('admin.depDrawer.reasonHint')}
          />
          <Textarea
            label={t('admin.depDrawer.comment')}
            placeholder={t('admin.depDrawer.commentPlaceholder')}
          />
          <Badge tone="neutral">{t('admin.depDrawer.reasonBadge')}</Badge>
        </div>
      </Modal>
    </>
  )
}

'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
import type { DepositDetail } from '@/server/admin/deposits'
import { useAdmin } from '../../_store/AdminStore'
import { claimAction, confirmAction, previewAction, refundAction, rejectAction } from '../actions'
import styles from '../../admin.module.css'

/**
 * Карточка заявки на пополнение — боковой панелью из списка.
 *
 * Отдельной страницей она сбивала: оператор разбирает очередь подряд
 * и терял место в списке на каждой заявке.
 *
 * Подтверждение — самое ответственное действие в админке. Поэтому:
 *
 *   * сумма вводится **фактически полученная**, а не заявленная:
 *     приходит столько, сколько пришло;
 *   * итог к зачислению считается на сервере **тем же кодом**, что
 *     и проводка, и показывается крупно до нажатия кнопки;
 *   * переопределение ставки требует обязательной причины.
 *
 * Заявка **захватывается** при открытии. Пометка «разбирает такой-то»
 * сама ничего не мешает — она нужна, чтобы двое не начали разбирать
 * одно и то же, не зная друг о друге. Запрет держится на сервере:
 * версия записи, переход только из нужного статуса и уникальный
 * индекс в леджере.
 */

/** Коды причин отклонения — те же, что принимает сервер. Выбор из
 *  списка, а не свободный текст: пользователь может читать интерфейс
 *  по-английски, и свободный текст уйдёт к нему непереведённым. */
const REJECT_REASONS = [
  { value: 'PAYMENT_NOT_FOUND', key: 'admin.reject.not-found' },
  { value: 'AMOUNT_MISMATCH', key: 'admin.reject.mismatch' },
  { value: 'NO_TX_LINK', key: 'admin.reject.no-link' },
  { value: 'OTHER', key: 'admin.reject.other' },
]

export interface DepositDrawerProps {
  deposit: DepositDetail | null
  amlMaxRisk: number
  onClose: () => void
}

export function DepositDrawer({ deposit, amlMaxRisk, onClose }: DepositDrawerProps) {
  const { locale, t } = useI18n()
  const { can, operator } = useAdmin()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [overrideFee, setOverrideFee] = useState(false)
  const [overrideBps, setOverrideBps] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [received, setReceived] = useState('')
  const [reasonCode, setReasonCode] = useState('PAYMENT_NOT_FOUND')
  const [comment, setComment] = useState('')
  const [preview, setPreview] = useState<DepositDetail['preview'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'credited' | 'rejected' | 'refunded' | null>(null)

  const mayApprove = can('APPROVE_DEPOSITS')
  const inQueue = deposit?.status === 'SUBMITTED' || deposit?.status === 'HELD'
  const claimable = inQueue
  // Захват чужой и ещё живой: предупреждаем, но не запрещаем — запрет
  // на сервере, и он сработает, даже если оператор пойдёт мимо кнопки.
  const claimedByOther =
    deposit?.claimedBy !== null && deposit?.claimedBy !== undefined && deposit.claimedBy !== operator.id

  /* Сброс состояния при смене заявки.
   *
   * В зависимостях только идентификатор, и это важно: расчёт
   * и суммы приходят новыми объектами при каждом ответе сервера,
   * а значит эффект срабатывал бы на каждом обновлении списка и
   * закрывал бы окно подтверждения прямо под руками оператора. */
  const depositId = deposit?.id ?? null
  /* В поле подставляется то, что известно о пришедшей сумме: у
   * поступления, увиденного сервисом адресов, это фактическая сумма,
   * а у заведённой руками заявки — заявленная. Поле всё равно требует
   * подтверждения: приходит столько, сколько пришло, а не сколько
   * заявлено. */
  const known = deposit?.amount ?? ''
  const previewOf = deposit?.preview ?? null

  useEffect(() => {
    setConfirmOpen(false)
    setRejectOpen(false)
    setRefundOpen(false)
    setOverrideFee(false)
    setOverrideBps('')
    setOverrideReason('')
    setComment('')
    setReasonCode('PAYMENT_NOT_FOUND')
    setError(null)
    setDone(null)
    setReceived(known)
    setPreview(previewOf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- см. комментарий выше
  }, [depositId])

  /* Захват при открытии. Он протухает по таймауту, поэтому «взял и
   * ушёл на обед» не блокирует заявку навсегда.
   *
   * Зависимость — идентификатор, а не сама заявка: по объекту эффект
   * срабатывал бы на каждом ответе сервера, а захват обновляет данные
   * и вызывал бы следующий ответ. */
  useEffect(() => {
    if (!depositId || !mayApprove) return
    if (claimable !== true) return
    void claimAction(depositId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- см. комментарий выше
  }, [depositId, mayApprove, claimable])

  function recalc(nextReceived: string, nextBps: string) {
    if (!deposit) return
    startTransition(async () => {
      const result = await previewAction({
        depositId: deposit.id,
        received: nextReceived,
        ...(nextBps === '' ? {} : { overrideBps: nextBps }),
      })
      if ('preview' in result && result.preview) {
        setPreview(result.preview)
        setError(null)
      } else {
        setPreview(null)
        setError(t('admin.depDrawer.badAmount'))
      }
    })
  }

  function submitConfirm() {
    if (!deposit) return
    setError(null)
    startTransition(async () => {
      const result = await confirmAction({
        depositId: deposit.id,
        received,
        ...(overrideFee && overrideBps !== '' ? { overrideBps } : {}),
        ...(overrideFee ? { reason: overrideReason } : {}),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setConfirmOpen(false)
      setDone('credited')
      router.refresh()
    })
  }

  function submitReject() {
    if (!deposit) return
    setError(null)
    startTransition(async () => {
      const result = await rejectAction({
        depositId: deposit.id,
        reasonCode,
        ...(comment.trim() === '' ? {} : { comment: comment.trim(), lang: locale }),
      })
      if (!result.ok) {
        setError(result.error ?? 'error')
        return
      }
      setRejectOpen(false)
      setDone('rejected')
      router.refresh()
    })
  }

  function submitRefund() {
    if (!deposit) return
    setError(null)
    startTransition(async () => {
      const result = await refundAction(deposit.id)
      if (!result.ok) {
        setError(result.error ?? 'error')
        return
      }
      setRefundOpen(false)
      setDone('refunded')
      router.refresh()
    })
  }

  const rejectOptions: SelectOption[] = REJECT_REASONS.map((reason) => ({
    value: reason.value,
    label: t(reason.key),
  }))

  return (
    <>
      <Drawer
        open={deposit !== null}
        onClose={onClose}
        title={
          deposit
            ? t('admin.depDrawer.title', { name: deposit.userName })
            : t('admin.depDrawer.fallback')
        }
        subtitle={deposit?.companyName}
        footer={
          /* Интерфейс скрывает недоступные действия, а не показывает
             их неактивными: иначе оператор тратит время на то, чего
             не может. */
          mayApprove && inQueue && done === null ? (
            <>
              <Button variant="secondary" disabled={pending} onClick={() => setRejectOpen(true)}>
                {t('admin.depDrawer.reject')}
              </Button>
              <Button disabled={pending} onClick={() => setConfirmOpen(true)}>
                {t('admin.depDrawer.approve')}
              </Button>
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
            {done === 'refunded' ? (
              <Toast
                tone="success"
                title={t('admin.depDrawer.refundSentTitle')}
                text={t('admin.depDrawer.refundSentText')}
              />
            ) : null}
            {error && !confirmOpen && !rejectOpen && !refundOpen ? (
              <Toast tone="danger" title={error} />
            ) : null}

            {!mayApprove ? (
              <Toast
                tone="neutral"
                title={t('admin.depDrawer.readOnlyTitle')}
                text={t('admin.depDrawer.readOnlyText')}
              />
            ) : null}

            {claimedByOther ? (
              <Toast
                tone="warning"
                title={t('admin.depDrawer.claimedTitle', {
                  name: deposit.claimedByName ?? deposit.claimedBy ?? '',
                })}
                text={t('admin.depDrawer.claimedText')}
              />
            ) : null}

            <Card density="dense">
              <CardHeader title={t('admin.depDrawer.requestCard')} />
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.col.user')}</span>
                  <span className={styles.rowValue}>
                    <Link href={`/admin/users?open=${deposit.userId}`}>{deposit.userName}</Link>
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.depDrawer.balance')}</span>
                  <span className={styles.rowValue}>
                    <Amount value={deposit.userBalance} currency="USD" size="caption" />
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.depDrawer.declared')}</span>
                  <span className={styles.rowValue}>
                    <Amount value={deposit.amount} currency="USD" size="caption" />
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

            {/* Проверка происхождения. Стоит до истории: пока вердикт
                не ясен, остальное не имеет значения.

                Оценку риска даёт внешний сервис. Мы её не считаем и
                не пересчитываем — только сравниваем с порогом из
                настроек. */}
            {deposit.amlVerdict ? (
              <Card density="dense">
                <CardHeader
                  title={t('admin.depDrawer.amlTitle')}
                  subtitle={t('admin.depDrawer.amlSubtitle', { limit: amlMaxRisk })}
                  action={
                    <Badge
                      tone={
                        deposit.amlVerdict === 'PASSED'
                          ? 'success'
                          : deposit.amlVerdict === 'FAILED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {t(
                        `admin.deposits.aml.${
                          deposit.amlVerdict === 'PASSED'
                            ? 'pass'
                            : deposit.amlVerdict === 'FAILED'
                              ? 'fail'
                              : 'unavailable'
                        }`,
                      )}
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

                {deposit.status === 'HELD' ? (
                  <div className={styles.stack}>
                    <Toast
                      tone="danger"
                      title={t('admin.depDrawer.heldTitle')}
                      text={t('admin.depDrawer.heldText')}
                    />
                    {/* Возврат запускает сам пользователь из приложения,
                        и это не послабление правила «деньги наружу —
                        через оператора»: средства в систему не
                        зачислялись, в леджере их нет, а вернуть их можно
                        ровно на один адрес — тот, с которого они пришли.
                        Выбора получателя нет, значит нет и решения,
                        которое должен принимать человек.

                        Оператору кнопка оставлена на случай, когда
                        пользователь не отвечает: деньги не могут висеть
                        на адресе вечно. */}
                    <Toast
                      tone="neutral"
                      title={t('admin.depDrawer.refundWaitTitle')}
                      text={t('admin.depDrawer.refundWaitText')}
                    />
                    {mayApprove && done !== 'refunded' && deposit.fromAddress ? (
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => setRefundOpen(true)}
                      >
                        {t('admin.depDrawer.refund')}
                      </Button>
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
              {deposit.history.length === 0 ? (
                <p className={styles.muted}>{t('admin.depDrawer.noHistory')}</p>
              ) : (
                <div className={styles.rows}>
                  {deposit.history.map((item) => (
                    <div className={styles.row} key={item.id}>
                      <span className={styles.rowLabel}>{formatDateTime(locale, item.at)}</span>
                      <span className={styles.rowValue}>
                        <Amount value={item.amount} currency="USD" size="caption" />
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
        open={confirmOpen && deposit !== null}
        onClose={() => setConfirmOpen(false)}
        title={t('admin.depDrawer.confirmTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              {t('admin.depDrawer.cancel')}
            </Button>
            <Button
              disabled={
                pending ||
                preview === null ||
                (overrideFee && overrideReason.trim() === '')
              }
              onClick={submitConfirm}
            >
              {t('admin.depDrawer.credit')}
            </Button>
          </>
        }
      >
        {deposit ? (
          <div className={styles.stack}>
            {error ? <Toast tone="danger" title={error} /> : null}

            <Input
              label={t('admin.depDrawer.received')}
              numeric
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              onBlur={() => recalc(received, overrideFee ? overrideBps : '')}
              hint={t('admin.depDrawer.receivedHint')}
            />

            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.depDrawer.feeLabel')}</span>
                <span className={styles.rowValue}>
                  {preview ? t('admin.depDrawer.feeBps', { bps: preview.bps }) : '—'}
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.fees.weHold')}</span>
                <span className={styles.rowValue}>
                  <Amount value={preview?.fee ?? '—'} currency="USD" size="caption" />
                </span>
              </div>
              <div className={[styles.row, styles.rowTotal].join(' ')}>
                <span className={styles.rowLabel}>{t('admin.fees.toCredit')}</span>
                <span className={styles.rowValue}>
                  <Amount value={preview?.net ?? '—'} currency="USD" size="kpi" />
                </span>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = !overrideFee
                setOverrideFee(next)
                if (!next) {
                  setOverrideBps('')
                  setOverrideReason('')
                  recalc(received, '')
                }
              }}
            >
              {overrideFee ? t('admin.depDrawer.keepRate') : t('admin.depDrawer.overrideRate')}
            </Button>

            {overrideFee ? (
              <>
                <Input
                  label={t('admin.depDrawer.overrideBps')}
                  numeric
                  value={overrideBps}
                  onChange={(e) => setOverrideBps(e.target.value)}
                  onBlur={() => recalc(received, overrideBps)}
                />
                <Textarea
                  label={t('admin.depDrawer.overrideReason')}
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder={t('admin.depDrawer.overrideReasonPlaceholder')}
                />
              </>
            ) : null}

            {/* Минимум пополнения — предупреждение, а не блокировка:
                деньги уже пришли, отказывать их зачислять нельзя. */}
            {preview?.belowMinimum ? (
              <Toast
                tone="warning"
                title={t('admin.depDrawer.minTitle', { amount: preview.minDeposit })}
                text={t('admin.depDrawer.minText')}
              />
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* --- Возврат отправителю ----------------------------------------- */}
      <Modal
        open={refundOpen && deposit !== null}
        onClose={() => setRefundOpen(false)}
        title={t('admin.depDrawer.refundTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefundOpen(false)}>
              {t('admin.depDrawer.cancel')}
            </Button>
            <Button variant="danger" disabled={pending} onClick={submitRefund}>
              {t('admin.depDrawer.refundConfirm')}
            </Button>
          </>
        }
      >
        {deposit ? (
          <div className={styles.stack}>
            {error ? <Toast tone="danger" title={error} /> : null}
            <Toast
              tone="warning"
              title={t('admin.depDrawer.refundWarnTitle')}
              text={t('admin.depDrawer.refundWarnText')}
            />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.depDrawer.refundAmount')}</span>
                <span className={styles.rowValue}>
                  <Amount value={deposit.amount} currency={deposit.asset} size="caption" />
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.depDrawer.networkFee')}</span>
                {/* Комиссию сети удерживает сервис кошелька, мы её не
                    считаем и заранее не знаем. */}
                <span className={styles.rowValue}>{t('admin.depDrawer.networkFeeUnknown')}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.depDrawer.fromAddress')}</span>
                <span className={[styles.rowValue, styles.mono].join(' ')}>
                  {deposit.fromAddress ?? '—'}
                </span>
              </div>
            </div>
            {/* Адрес после возврата не живёт: он засвечен в той же
                цепочке, и следующее поступление притащит ту же историю. */}
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
        open={rejectOpen && deposit !== null}
        onClose={() => setRejectOpen(false)}
        title={t('admin.depDrawer.rejectTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>
              {t('admin.depDrawer.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={pending || (reasonCode === 'OTHER' && comment.trim() === '')}
              onClick={submitReject}
            >
              {t('admin.depDrawer.reject')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          {error ? <Toast tone="danger" title={error} /> : null}
          <Select
            label={t('admin.depDrawer.reason')}
            options={rejectOptions}
            value={reasonCode}
            onChange={setReasonCode}
            hint={t('admin.depDrawer.reasonHint')}
          />
          <Textarea
            label={t('admin.depDrawer.comment')}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('admin.depDrawer.commentPlaceholder')}
          />
          <Badge tone="neutral">{t('admin.depDrawer.reasonBadge')}</Badge>
        </div>
      </Modal>
    </>
  )
}

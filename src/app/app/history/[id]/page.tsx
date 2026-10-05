'use client'

import { use } from 'react'
import { Amount, Badge, Card, CardHeader, Toast } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { useStore } from '@/fixtures/store'
import { AppShell } from '../../AppShell'
import styles from '../../screens.module.css'

/**
 * Карточка операции.
 *
 * Здесь закрываются самые частые поводы для обращения в поддержку:
 * холд и списание разошлись, возврат пришёл меньше покупки. Причину мы
 * знаем точно, поэтому пишем её прямо, без общих формулировок
 * (docs/states-user.md, группа Г).
 */
export default function OperationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t, locale } = useI18n()
  const { scenario } = useStore()

  const op = scenario.operations.find((o) => o.id === id)
  if (!op) {
    return (
      <AppShell title={t('op.detail.title')} back>
        <p className={styles.text}>{t('history.empty.title')}</p>
      </AppShell>
    )
  }

  // Название мерчанта не переводится никогда.
  const title = op.merchant ?? t(op.titleKey ?? `op.type.${op.type}`)
  const diverged = op.authorized && op.settled && op.authorized !== op.settled

  return (
    <AppShell title={t('op.detail.title')} back>
      <div className={styles.stack}>
        <div className={styles.stackTight}>
          {/* Сумма — главное в чеке, поэтому она сверху. Название мерчанта
              под ней обычным размером: оно приходит сырым и бывает длинным,
              крупным кеглем такая строка занимает пол-экрана. */}
          <Amount
            value={op.amount}
            currency={op.currency}
            size="display"
            struck={op.status === 'declined'}
          />
          <div className={styles.merchant}>{title}</div>
          <div>
            <Badge
              tone={
                op.status === 'declined'
                  ? 'danger'
                  : op.status === 'pending'
                    ? 'warning'
                    : op.status === 'refund'
                      ? 'brand'
                      : 'success'
              }
            >
              {t(`op.status.${op.status}`)}
            </Badge>
          </div>
        </div>

        {/* Г-1. Холд и списание разошлись. Причину называем конкретно. */}
        {diverged ? (
          <Card>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('op.detail.authorized')}</span>
                <span className={styles.rowValue}>
                  <Amount value={op.authorized!} currency={op.currency} />
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('op.detail.settled')}</span>
                <span className={styles.rowValue}>
                  <Amount value={op.settled!} currency={op.currency} />
                </span>
              </div>
            </div>
            <p className={styles.note}>
              {op.diffReason === 'tips' ? t('op.detail.diff.tips') : t('op.detail.diff.rate')}
            </p>
          </Card>
        ) : null}

        {/* Г-2. Возврат пришёл меньше покупки — самый частый повод для
            обращения. Третья строка объяснения обязательна. */}
        {op.status === 'refund' && op.refundPurchase ? (
          <Card>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('op.detail.refund.purchase')}</span>
                <span className={styles.rowValue}>
                  <Amount value={op.refundPurchase} currency={op.currency} />
                  {op.refundPurchaseLocal ? ` (${op.refundPurchaseLocal} ${op.localCurrency})` : null}
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('op.detail.refund.refund')}</span>
                <span className={styles.rowValue}>
                  <Amount value={op.amount} currency={op.currency} />
                  {op.localAmount ? ` (${op.localAmount} ${op.localCurrency})` : null}
                </span>
              </div>
            </div>
            <p className={styles.note}>{t('op.detail.refund.note')}</p>
          </Card>
        ) : null}

        <Card>
          <CardHeader title={t('op.detail.title')} />
          <div className={styles.rows}>
            {op.cardLast4 ? (
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('op.detail.card')}</span>
                <span className={styles.rowValue}>•••• {op.cardLast4}</span>
              </div>
            ) : null}
            {op.localAmount ? (
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('op.detail.merchantAmount')}</span>
                <span className={styles.rowValue}>
                  {op.localAmount} {op.localCurrency}
                </span>
              </div>
            ) : null}
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t('op.detail.authorizedAt')}</span>
              <span className={styles.rowValue}>{formatDateTime(locale, op.occurredAt)}</span>
            </div>
            {op.settledAt ? (
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('op.detail.settledAt')}</span>
                <span className={styles.rowValue}>{formatDateTime(locale, op.settledAt)}</span>
              </div>
            ) : null}
          </div>
        </Card>

        {/* Курс только расчётный и подписан как расчётный. Официального
            курса в API нет, выдумывать его нельзя. Строки «комиссия за
            конвертацию» здесь нет: её величины мы не знаем. */}
        {op.derivedRate ? (
          <Card tone="nested">
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t('op.detail.rate')}</span>
              <span className={styles.rowValue}>{op.derivedRate}</span>
            </div>
            <p className={styles.note}>{t('op.detail.rateNote')}</p>
          </Card>
        ) : null}

        {/* Причина отказа — человеческим языком, а не кодом. Отказ по пулу
            компании показывается как технические работы. */}
        {op.declineReasonCode ? (
          <Toast
            tone="danger"
            title={t('op.detail.declineReason')}
            text={t(`decline.${op.declineReasonCode}`)}
          />
        ) : null}
      </div>
    </AppShell>
  )
}

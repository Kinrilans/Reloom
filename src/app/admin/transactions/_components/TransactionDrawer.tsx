'use client'

import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import { Amount, Badge, Button, Card, CardHeader, Drawer, Toast } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { TRANSACTIONS, companyName } from '@/fixtures/admin'
import styles from '../../admin.module.css'

/**
 * Карточка операции — боковой панелью из списка.
 *
 * Операции просматривают подряд, разбирая обращение: отдельная страница
 * на каждую означала бы возврат к списку и потерю фильтров.
 */

export interface TransactionDrawerProps {
  transactionId: string | null
  onClose: () => void
}

export function TransactionDrawer({ transactionId, onClose }: TransactionDrawerProps) {
  const { locale, t } = useI18n()

  const tx = TRANSACTIONS.find((t) => t.id === transactionId)

  /* Сырой ответ эмитента — для разбора. Собран из тех же демо-данных, но
     показан как есть: id транзакции единственный без префикса, это id
     эмитента, а не их внутренний. */
  const raw = tx
    ? JSON.stringify(
        {
          id: tx.id,
          status: tx.status,
          amount: tx.amount,
          currency: tx.currency,
          localAmount: tx.localAmount,
          localCurrency: tx.localCurrency,
          merchantName: tx.merchant,
          declineReason: tx.declineReasonCode,
          forcePosted: tx.anomaly === 'FORCE_POSTED',
          occurredAt: tx.at,
          _metadata: { requestId: 'req_7KQD82XFM4VT9WAH' },
        },
        null,
        2,
      )
    : ''

  return (
    <Drawer
      open={tx !== undefined}
      onClose={onClose}
      title={tx ? tx.merchant : t('admin.txDrawer.title')}
      subtitle={tx ? `${tx.userName} · ${companyName(tx.companyId)}` : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('admin.profile.close')}
        </Button>
      }
    >
      {tx ? (
        <>
          {tx.anomaly ? (
            <Toast
              tone="warning"
              title={t('admin.txDrawer.anomaly')}
              text={t(`admin.anomalyText.${tx.anomaly}`)}
            />
          ) : null}

          <Card density="dense">
            <CardHeader title={t('admin.txDrawer.title')} />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.txDrawer.amount')}</span>
                <span className={styles.rowValue}>
                  <Amount value={tx.amount} currency={tx.currency} size="kpi" />
                </span>
              </div>
              {tx.localAmount ? (
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.txDrawer.localAmount')}</span>
                  <span className={styles.rowValue}>
                    {tx.localAmount} {tx.localCurrency}
                  </span>
                </div>
              ) : null}
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.col.status')}</span>
                <span className={styles.rowValue}>
                  <Badge tone={tx.status === 'declined' ? 'danger' : 'success'}>{tx.status}</Badge>
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.txDrawer.time')}</span>
                <span className={styles.rowValue}>{formatDateTime(locale, tx.at)}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.col.user')}</span>
                <span className={styles.rowValue}>
                  <Link href={`/admin/users/${tx.userId}`}>{tx.userName}</Link>
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.col.card')}</span>
                <span className={styles.rowValue}>•••• {tx.cardLast4}</span>
              </div>
              {tx.declineReasonCode ? (
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.txDrawer.declineCode')}</span>
                  <span className={styles.rowValue}>
                    <span className={styles.mono}>{tx.declineReasonCode}</span>
                  </span>
                </div>
              ) : null}
            </div>

            {tx.declineReasonCode === 'account_credit_limit_exceeded' ? (
              <p className={styles.kpiHint}>{t('admin.txDrawer.poolHint')}</p>
            ) : null}
          </Card>

          <Card density="dense">
            <CardHeader
              title={t('admin.txDrawer.rawTitle')}
              subtitle={t('admin.txDrawer.rawSubtitle')}
            />
            <pre className={styles.raw}>{raw}</pre>
          </Card>

          <Card density="dense">
            <CardHeader title={t('admin.txDrawer.lookTitle')} />
            <ul className={styles.muted}>
              <li>{t('admin.txDrawer.lookRequestId')}</li>
              <li>{t('admin.txDrawer.lookLocal')}</li>
              <li>{t('admin.txDrawer.lookRate')}</li>
            </ul>
            {tx.anomaly ? (
              <p className={styles.kpiHint}>
                <TriangleAlert size={12} /> {t('admin.txDrawer.anomalyNote')}
              </p>
            ) : null}
          </Card>
        </>
      ) : null}
    </Drawer>
  )
}

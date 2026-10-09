'use client'

import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import { Amount, Badge, Button, Card, CardHeader, Drawer, Toast } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type { TransactionDetail } from '@/server/admin/transactions'
import styles from '../../admin.module.css'

/**
 * Карточка операции — боковой панелью из списка.
 *
 * Операции просматривают подряд, разбирая обращение: отдельная
 * страница на каждую означала бы возврат к списку и потерю фильтров.
 *
 * Сумма авторизации показывается рядом со списанной нарочно. Она
 * живёт только в событии — чтение транзакции у эмитента её затирает,
 * — и без неё не отличить курсовую разницу от чаевых.
 */

export interface TransactionDrawerProps {
  transaction: TransactionDetail | null
  onClose: () => void
}

export function TransactionDrawer({ transaction, onClose }: TransactionDrawerProps) {
  const { locale, t } = useI18n()

  return (
    <Drawer
      open={transaction !== null}
      onClose={onClose}
      title={transaction?.merchant ?? t('admin.txDrawer.title')}
      subtitle={transaction ? `${transaction.userName} · ${transaction.companyName}` : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('admin.profile.close')}
        </Button>
      }
    >
      {transaction ? (
        <>
          {transaction.anomaly ? (
            <Toast
              tone="warning"
              title={t('admin.txDrawer.anomaly')}
              text={t(`admin.anomalyText.${transaction.anomaly}`)}
            />
          ) : null}

          <Card density="dense">
            <CardHeader title={t('admin.txDrawer.title')} />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.txDrawer.amount')}</span>
                <span className={styles.rowValue}>
                  <Amount value={transaction.amount} currency={transaction.currency} size="kpi" />
                </span>
              </div>
              {transaction.authorized ? (
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.txDrawer.authorized')}</span>
                  <span className={styles.rowValue}>
                    <Amount value={transaction.authorized} currency="USD" size="caption" />
                  </span>
                </div>
              ) : null}
              {transaction.localAmount ? (
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.txDrawer.localAmount')}</span>
                  <span className={styles.rowValue}>
                    {transaction.localAmount} {transaction.localCurrency ?? ''}
                  </span>
                </div>
              ) : null}
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.col.status')}</span>
                <span className={styles.rowValue}>
                  <Badge tone={transaction.display === 'declined' ? 'danger' : 'success'}>
                    {t(`admin.tx.status.${transaction.display}`)}
                  </Badge>
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.txDrawer.time')}</span>
                <span className={styles.rowValue}>{formatDateTime(locale, transaction.at)}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.col.user')}</span>
                <span className={styles.rowValue}>
                  <Link href={`/admin/users?open=${transaction.userId}&filter=all`}>
                    {transaction.userName}
                  </Link>
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.col.card')}</span>
                <span className={styles.rowValue}>
                  <Link href={`/admin/cards?open=${transaction.cardId}`}>
                    •••• {transaction.cardLast4 ?? '????'}
                  </Link>
                </span>
              </div>
              {transaction.declineReason ? (
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.txDrawer.declineCode')}</span>
                  <span className={styles.rowValue}>
                    <span className={styles.mono}>{transaction.declineReason}</span>
                  </span>
                </div>
              ) : null}
            </div>

            {transaction.declineReason === 'account_credit_limit_exceeded' ? (
              <p className={styles.kpiHint}>{t('admin.txDrawer.poolHint')}</p>
            ) : null}
          </Card>

          {/* Проводка в леджере. У авторизации её нет: резерв стоит,
              денег ещё не списано. */}
          <Card density="dense">
            <CardHeader
              title={t('admin.txDrawer.ledgerTitle')}
              subtitle={t('admin.txDrawer.ledgerSubtitle')}
            />
            {transaction.ledger ? (
              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.txDrawer.ledgerType')}</span>
                  <span className={styles.rowValue}>
                    {t(`admin.ledger.${transaction.ledger.type}`)}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.txDrawer.ledgerAmount')}</span>
                  <span className={styles.rowValue}>
                    <Amount value={transaction.ledger.amount} currency="USD" size="caption" />
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.txDrawer.time')}</span>
                  <span className={styles.rowValue}>
                    {formatDateTime(locale, transaction.ledger.at)}
                  </span>
                </div>
              </div>
            ) : (
              <p className={styles.muted}>{t('admin.txDrawer.noLedger')}</p>
            )}
          </Card>

          <Card density="dense">
            <CardHeader
              title={t('admin.txDrawer.rawTitle')}
              subtitle={t('admin.txDrawer.rawSubtitle')}
            />
            <pre className={styles.raw}>{JSON.stringify(transaction.raw, null, 2)}</pre>
          </Card>

          <Card density="dense">
            <CardHeader title={t('admin.txDrawer.lookTitle')} />
            <ul className={styles.muted}>
              <li>{t('admin.txDrawer.lookRequestId')}</li>
              <li>{t('admin.txDrawer.lookLocal')}</li>
              <li>{t('admin.txDrawer.lookRate')}</li>
            </ul>
            {transaction.anomaly ? (
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

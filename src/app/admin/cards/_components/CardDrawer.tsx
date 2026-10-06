'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Snowflake, Sun, Trash2, Undo2 } from 'lucide-react'
import {
  Amount,
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  List,
  ListRow,
  Modal,
  Toast,
} from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { CARDS, TRANSACTIONS, companyName } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import styles from '../../admin.module.css'

/**
 * Карточка карты — боковой панелью из списка.
 *
 * Прямой отмены нет: карта закрывается только через заморозку, а отмена
 * происходит автоматически при нулевом остатке и отсутствии незакрытых
 * авторизаций. Отмена в Oxen необратима (docs/domain-and-money.md).
 *
 * Разморозка карты, замороженной из-за минуса, недоступна: сначала надо
 * вывести баланс из минуса.
 */
export interface CardDrawerProps {
  cardId: string | null
  onClose: () => void
}

export function CardDrawer({ cardId, onClose }: CardDrawerProps) {
  const { locale, t } = useI18n()
  const { can } = useAdmin()
  const router = useRouter()
  const [closing, setClosing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const card = CARDS.find((c) => c.id === cardId)
  const frozenByNegative = card?.freezeReason === 'NEGATIVE_BALANCE'
  const isClosing = card?.status === 'CLOSING'
  const transactions = TRANSACTIONS.filter((t) => t.cardLast4 === card?.last4).slice(0, 10)
  const mayManage = can('MANAGE_USERS')

  return (
    <>
    <Drawer
      open={card !== undefined}
      onClose={onClose}
      title={
        card ? t('admin.cardDrawer.title', { last4: card.last4 }) : t('admin.cardDrawer.fallback')
      }
      subtitle={card ? `${card.userName} · ${companyName(card.companyId)}` : undefined}
      footer={
        <>
          <Button variant="secondary" iconStart={<RefreshCw size={16} />}>
            {t('admin.cardDrawer.reread')}
          </Button>
          <Button onClick={onClose}>{t('admin.profile.close')}</Button>
        </>
      }
    >
      {card ? (
        <>
      {notice ? <Toast tone="success" title={notice} onClose={() => setNotice(null)} /> : null}

      {frozenByNegative ? (
        <Toast
          tone="danger"
          title={t('admin.cardDrawer.frozenTitle')}
          text={t('admin.cardDrawer.frozenText')}
        />
      ) : null}

      {isClosing ? (
        <Toast
          tone="warning"
          title={t('admin.cardDrawer.closingTitle')}
          text={t('admin.cardDrawer.closingText', { amount: card.held ?? '0.00' })}
        />
      ) : null}

      <div className={styles.stack}>
        <div className={styles.stack}>
          <Card density="dense">
            <CardHeader title={t('admin.cardDrawer.params')} />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.col.user')}</span>
                <span className={styles.rowValue}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/admin/users?open=${card.userId}`)}
                  >
                    {card.userName}
                  </Button>
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.col.company')}</span>
                <span className={styles.rowValue}>{companyName(card.companyId)}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.col.type')}</span>
                <span className={styles.rowValue}>
                  <Badge tone={card.isPrimary ? 'brand' : 'neutral'}>
                    {card.isPrimary ? t('admin.card.primary') : t('admin.card.child')}
                  </Badge>
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.cardDrawer.expires')}</span>
                <span className={styles.rowValue}>{card.expires}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.cardDrawer.applied')}</span>
                <span className={styles.rowValue}>
                  <Amount value={card.applied} currency="USD" size="caption" />
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.col.spent')}</span>
                <span className={styles.rowValue}>
                  <Amount value={card.spent} currency="USD" size="caption" />
                </span>
              </div>
              <div className={[styles.row, styles.rowTotal].join(' ')}>
                <span className={styles.rowLabel}>{t('admin.cardDrawer.remainder')}</span>
                <span className={styles.rowValue}>
                  <Amount value={card.available} currency="USD" size="kpi" />
                </span>
              </div>
            </div>
            <p className={styles.kpiHint}>{t('admin.cardDrawer.ceilingHint')}</p>
          </Card>

          <Card density="dense">
            <CardHeader title={t('admin.cardDrawer.operations')} />
            {transactions.length === 0 ? (
              <p className={styles.muted}>{t('admin.cardDrawer.noOperations')}</p>
            ) : (
              <List density="dense">
                {transactions.map((tx) => (
                  <ListRow
                    key={tx.id}
                    title={tx.merchant}
                    subtitle={formatDateTime(locale, tx.at)}
                    trailing={
                      <Amount
                        value={tx.amount}
                        currency={tx.currency}
                        size="caption"
                        struck={tx.status === 'declined' || tx.status === 'reversed'}
                      />
                    }
                  />
                ))}
              </List>
            )}
          </Card>
        </div>

        <Card density="dense">
          <CardHeader title={t('admin.cardDrawer.actions')} />
          <div className={styles.stackTight}>
            {!mayManage ? (
              <p className={styles.muted}>{t('admin.cardDrawer.needRight')}</p>
            ) : (
              <>
                {card.status === 'ACTIVE' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    iconStart={<Snowflake size={16} />}
                    onClick={() => setNotice(t('admin.cardDrawer.frozenNotice'))}
                  >
                    {t('admin.cardDrawer.freeze')}
                  </Button>
                ) : null}

                {/* Кнопку разморозки при минусе не показываем вовсе: она
                    заведомо не сработает. */}
                {card.status === 'FROZEN' && !frozenByNegative ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    iconStart={<Sun size={16} />}
                    onClick={() => setNotice(t('admin.cardDrawer.unfrozenNotice'))}
                  >
                    {t('admin.cardDrawer.unfreeze')}
                  </Button>
                ) : null}

                {isClosing ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    iconStart={<Undo2 size={16} />}
                    onClick={() => setNotice(t('admin.cardDrawer.reopenNotice'))}
                  >
                    {t('admin.cardDrawer.reopen')}
                  </Button>
                ) : card.status !== 'CANCELED' ? (
                  <Button
                    variant="danger"
                    size="sm"
                    fullWidth
                    iconStart={<Trash2 size={16} />}
                    onClick={() => setClosing(true)}
                  >
                    {t('admin.cardDrawer.close')}
                  </Button>
                ) : null}
              </>
            )}
          </div>

          <p className={styles.kpiHint}>{t('admin.cardDrawer.mismatchHint')}</p>
        </Card>
      </div>
        </>
      ) : null}
    </Drawer>

      <Modal
        open={closing && card !== undefined}
        onClose={() => setClosing(false)}
        title={t('admin.cardDrawer.closeTitle', { last4: card?.last4 ?? '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setClosing(false)}>
              {t('admin.newUser.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setClosing(false)
                setNotice(t('admin.cardDrawer.closeNotice'))
              }}
            >
              {t('admin.cardDrawer.closeSubmit')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <p className={styles.muted}>{t('admin.cardDrawer.closeText')}</p>
          <Toast
            tone="warning"
            title={t('admin.cardDrawer.remainderTitle')}
            text={t('admin.cardDrawer.remainderText')}
          />
        </div>
      </Modal>
    </>
  )
}

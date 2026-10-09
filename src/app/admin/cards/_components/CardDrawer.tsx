'use client'

import { useEffect, useState, useTransition } from 'react'
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
  Select,
  Toast,
} from '@/ui'
import type { SelectOption } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type { CardDetail } from '@/server/admin/cards'
import { useAdmin } from '../../_store/AdminStore'
import { closeAction, freezeAction, reopenAction, rereadAction, unfreezeAction } from '../actions'
import styles from '../../admin.module.css'

/**
 * Карточка карты — боковой панелью из списка.
 *
 * Прямой отмены нет: карта закрывается только через заморозку, а
 * отмена происходит автоматически при нулевом остатке и отсутствии
 * незакрытых авторизаций. Отмена в Oxen необратима.
 *
 * Разморозка карты, замороженной из-за минуса, недоступна: сначала
 * надо вывести баланс из минуса. Кнопка не показывается вовсе — она
 * заведомо не сработает.
 */
export interface CardDrawerProps {
  card: CardDetail | null
  onClose: () => void
}

export function CardDrawer({ card, onClose }: CardDrawerProps) {
  const { locale, t } = useI18n()
  const { can } = useAdmin()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [closingOpen, setClosingOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setClosingOpen(false)
    setTarget('')
    setNotice(null)
    setError(null)
  }, [card?.id])

  const frozenByNegative = card?.freezeReason === 'NEGATIVE_BALANCE'
  const isClosing = card?.status === 'CLOSING'
  const mayManage = can('MANAGE_USERS')

  function run(action: () => Promise<{ ok: boolean; error?: string }>, message: string): void {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setError(result.error ?? 'error')
        return
      }
      setNotice(message)
      router.refresh()
    })
  }

  const targetOptions: SelectOption[] = [
    /* «Выпустить новую» стоит первым и выбрано по умолчанию: у главной
       карты других вариантов может не быть вовсе, а остаток должен
       куда-то уйти. */
    { value: '', label: t('admin.cardDrawer.planNew') },
    ...(card?.siblings ?? []).map((sibling) => ({
      value: sibling.id,
      label: `•••• ${sibling.last4 ?? '????'}${sibling.isPrimary ? ` · ${t('admin.card.primary')}` : ''}`,
    })),
  ]

  return (
    <>
      <Drawer
        open={card !== null}
        onClose={onClose}
        title={
          card
            ? t('admin.cardDrawer.title', { last4: card.last4 ?? '????' })
            : t('admin.cardDrawer.fallback')
        }
        subtitle={card ? `${card.userName} · ${card.companyName}` : undefined}
        footer={
          <>
            <Button
              variant="secondary"
              iconStart={<RefreshCw size={16} />}
              disabled={pending || card === null}
              onClick={() => {
                if (!card) return
                run(() => rereadAction(card.id), t('admin.cardDrawer.rereadNotice'))
              }}
            >
              {t('admin.cardDrawer.reread')}
            </Button>
            <Button onClick={onClose}>{t('admin.profile.close')}</Button>
          </>
        }
      >
        {card ? (
          <>
            {notice ? (
              <Toast tone="success" title={notice} onClose={() => setNotice(null)} />
            ) : null}
            {error ? <Toast tone="danger" title={error} /> : null}

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
                text={t('admin.cardDrawer.closingText', { amount: card.held })}
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
                          onClick={() => router.push(`/admin/users?open=${card.userId}&filter=all`)}
                        >
                          {card.userName}
                        </Button>
                      </span>
                    </div>
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>{t('admin.col.company')}</span>
                      <span className={styles.rowValue}>{card.companyName}</span>
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
                      <span className={styles.rowLabel}>{t('admin.cardDrawer.oxenId')}</span>
                      <span className={[styles.rowValue, styles.mono].join(' ')}>
                        {card.oxenCardId}
                      </span>
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
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>{t('admin.col.held')}</span>
                      <span className={styles.rowValue}>
                        <Amount value={card.held} currency="USD" size="caption" />
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

                {/* Незакрытые операции — именно они держат резерв и
                    мешают отменить карту. Без этого списка непонятно,
                    чего ждём. */}
                {card.openOperations.length > 0 ? (
                  <Card density="dense">
                    <CardHeader
                      title={t('admin.cardDrawer.openTitle')}
                      subtitle={t('admin.cardDrawer.openSubtitle')}
                    />
                    <List density="dense">
                      {card.openOperations.map((operation) => (
                        <ListRow
                          key={operation.id}
                          title={operation.merchant ?? t('admin.cardDrawer.noMerchant')}
                          subtitle={formatDateTime(locale, operation.at)}
                          trailing={
                            <Amount value={operation.amount} currency="USD" size="caption" />
                          }
                        />
                      ))}
                    </List>
                  </Card>
                ) : null}

                <Card density="dense">
                  <CardHeader title={t('admin.cardDrawer.operations')} />
                  {card.recent.length === 0 ? (
                    <p className={styles.muted}>{t('admin.cardDrawer.noOperations')}</p>
                  ) : (
                    <List density="dense">
                      {card.recent.map((operation) => (
                        <ListRow
                          key={operation.id}
                          title={operation.merchant ?? t('admin.cardDrawer.noMerchant')}
                          subtitle={formatDateTime(locale, operation.at)}
                          trailing={
                            <Amount
                              value={operation.amount}
                              currency="USD"
                              size="caption"
                              struck={
                                operation.status === 'DECLINED' || operation.status === 'REVERSED'
                              }
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
                          disabled={pending}
                          iconStart={<Snowflake size={16} />}
                          onClick={() =>
                            run(() => freezeAction(card.id), t('admin.cardDrawer.frozenNotice'))
                          }
                        >
                          {t('admin.cardDrawer.freeze')}
                        </Button>
                      ) : null}

                      {card.status === 'FROZEN' && !frozenByNegative ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          fullWidth
                          disabled={pending}
                          iconStart={<Sun size={16} />}
                          onClick={() =>
                            run(() => unfreezeAction(card.id), t('admin.cardDrawer.unfrozenNotice'))
                          }
                        >
                          {t('admin.cardDrawer.unfreeze')}
                        </Button>
                      ) : null}

                      {isClosing ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          fullWidth
                          disabled={pending}
                          iconStart={<Undo2 size={16} />}
                          onClick={() =>
                            run(() => reopenAction(card.id), t('admin.cardDrawer.reopenNotice'))
                          }
                        >
                          {t('admin.cardDrawer.reopen')}
                        </Button>
                      ) : card.status !== 'CANCELED' ? (
                        <Button
                          variant="danger"
                          size="sm"
                          fullWidth
                          iconStart={<Trash2 size={16} />}
                          onClick={() => setClosingOpen(true)}
                        >
                          {t('admin.cardDrawer.close')}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>

                {card.blockers.length > 0 && isClosing ? (
                  <p className={styles.kpiHint}>
                    {t('admin.cardDrawer.blockers', { list: card.blockers.join(', ') })}
                  </p>
                ) : null}

                <p className={styles.kpiHint}>{t('admin.cardDrawer.mismatchHint')}</p>
              </Card>
            </div>
          </>
        ) : null}
      </Drawer>

      <Modal
        open={closingOpen && card !== null}
        onClose={() => setClosingOpen(false)}
        title={t('admin.cardDrawer.closeTitle', { last4: card?.last4 ?? '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setClosingOpen(false)}>
              {t('admin.newUser.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={pending || card === null}
              onClick={() => {
                if (!card) return
                setClosingOpen(false)
                run(
                  () => closeAction({ cardId: card.id, toCardId: target }),
                  t('admin.cardDrawer.closeNotice'),
                )
              }}
            >
              {t('admin.cardDrawer.closeSubmit')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <p className={styles.muted}>{t('admin.cardDrawer.closeText')}</p>
          {/* Куда уходит остаток, выбирается ДО начала переноса:
              решать посреди процесса значит оставить деньги висеть,
              пока человек думает. */}
          <Select
            label={t('admin.cardDrawer.planLabel')}
            options={targetOptions}
            value={target}
            onChange={setTarget}
            hint={t('admin.cardDrawer.planHint')}
          />
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

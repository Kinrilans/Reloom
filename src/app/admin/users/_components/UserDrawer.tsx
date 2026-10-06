'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Ban,
  CreditCard,
  KeyRound,
  LogOut,
  Pencil,
  Snowflake,
  UserCheck,
  Wallet,
} from 'lucide-react'
import {
  Amount,
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  Input,
  List,
  ListRow,
  Modal,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
  Toast,
} from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { CARDS, FEES, TRANSACTIONS, USERS, companyName } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import styles from '../../admin.module.css'

/**
 * Карточка пользователя — боковой панелью из списка.
 *
 * Отдельной страницей она уводила из списка: оператор разбирает
 * обращения подряд и терял фильтры, страницу и место прокрутки.
 *
 * Реквизиты карт оператору НЕ показываются никогда: нет сценария, в котором
 * оператору нужен чужой номер карты (docs/flows-admin.md).
 *
 * Оператор никогда не вводит абсолютное значение лимита карты. Он оперирует
 * зачислениями и выводами по балансу, лимиты пересчитывает система.
 */

type Dialog = 'withdraw' | 'adjust' | 'block' | 'offboard' | 'reset2fa' | null

export interface UserDrawerProps {
  userId: string | null
  onClose: () => void
}

export function UserDrawer({ userId, onClose }: UserDrawerProps) {
  const { locale, t } = useI18n()
  const { can } = useAdmin()
  const router = useRouter()

  const [dialog, setDialog] = useState<Dialog>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustRepeat, setAdjustRepeat] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const user = USERS.find((u) => u.id === userId)
  const cards = CARDS.filter((c) => c.userId === user?.id)
  const activeCards = cards.filter((c) => c.status !== 'CANCELED')
  const canceledCards = cards.filter((c) => c.status === 'CANCELED')
  const history = TRANSACTIONS.filter((t) => t.userId === user?.id).slice(0, 12)

  return (
    <>
    <Drawer
      open={user !== undefined}
      onClose={onClose}
      title={user?.name ?? t('admin.userDrawer.fallback')}
      subtitle={user ? companyName(user.companyId) : undefined}
      footer={
        <>
          {can('WITHDRAW') ? (
            <Button variant="secondary" iconStart={<Wallet size={16} />} onClick={() => setDialog('withdraw')}>
              {t('admin.userDrawer.withdraw')}
            </Button>
          ) : null}
          {can('ADJUST_BALANCE') ? (
            <Button variant="secondary" iconStart={<Pencil size={16} />} onClick={() => setDialog('adjust')}>
              {t('admin.userDrawer.adjust')}
            </Button>
          ) : null}
          {can('MANAGE_USERS') ? (
            <Button variant="danger" iconStart={<Ban size={16} />} onClick={() => setDialog('block')}>
              {user?.status === 'BLOCKED'
                ? t('admin.userDrawer.unblock')
                : t('admin.userDrawer.block')}
            </Button>
          ) : null}
        </>
      }
    >
      {user ? (
        <>
      {notice ? <Toast tone="success" title={notice} onClose={() => setNotice(null)} /> : null}

      {user.status === 'BLOCKED' ? (
        <Toast
          tone="neutral"
          title={t('admin.userDrawer.blockedTitle')}
          text={t('admin.userDrawer.blockedText')}
        />
      ) : null}

      {user.negative ? (
        <Toast
          tone="danger"
          title={t('admin.userDrawer.negativeTitle')}
          text={t('admin.userDrawer.negativeText')}
        />
      ) : null}

      {user.oxenStatus === 'NEEDS_REVIEW' || user.oxenStatus === 'REJECTED' ? (
        <Toast
          tone="warning"
          title={t('admin.userDrawer.stuckTitle')}
          text={t('admin.userDrawer.stuckText')}
        />
      ) : null}

      <div className={styles.stack}>
        <div className={styles.stack}>
          <Card density="dense">
            <CardHeader
              title={t('admin.userDrawer.money')}
              subtitle={t('admin.userDrawer.moneySubtitle')}
            />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.userDrawer.deposited')}</span>
                <span className={styles.rowValue}>
                  <Amount value={user.money.deposited} currency="USD" size="caption" />
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.col.spent')}</span>
                <span className={styles.rowValue}>
                  <Amount value={user.money.spent} currency="USD" size="caption" />
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.userDrawer.fees')}</span>
                <span className={styles.rowValue}>
                  <Amount value={user.money.fees} currency="USD" size="caption" />
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.userDrawer.withdrawn')}</span>
                <span className={styles.rowValue}>
                  <Amount value={user.money.withdrawn} currency="USD" size="caption" />
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.userDrawer.unallocated')}</span>
                <span className={styles.rowValue}>
                  <Amount value={user.unallocated} currency="USD" size="caption" />
                </span>
              </div>
              <div className={[styles.row, styles.rowTotal].join(' ')}>
                <span className={styles.rowLabel}>{t('admin.userDrawer.balance')}</span>
                <span className={styles.rowValue}>
                  <Amount value={user.balance} currency="USD" size="kpi" />
                </span>
              </div>
            </div>
          </Card>

          <Card density="dense">
            <CardHeader
              title={t('admin.userDrawer.cardsTitle')}
              subtitle={t('admin.userDrawer.cardsSubtitle')}
            />
            <Table>
              <THead>
                <TR>
                  <TH>{t('admin.col.card')}</TH>
                  <TH>{t('admin.col.type')}</TH>
                  <TH>{t('admin.col.status')}</TH>
                  <TH align="numeric">{t('admin.col.applied')}</TH>
                  <TH align="numeric">{t('admin.col.spent')}</TH>
                  <TH align="numeric">{t('admin.col.available')}</TH>
                  <TH align="actions">{t('admin.col.action')}</TH>
                </TR>
              </THead>
              <TBody>
                {activeCards.map((card) => (
                  <TR key={card.id}>
                    <TD primary>•••• {card.last4}</TD>
                    <TD>
                      <Badge tone={card.isPrimary ? 'brand' : 'neutral'}>
                        {card.isPrimary ? t('admin.card.primary') : t('admin.card.child')}
                      </Badge>
                    </TD>
                    <TD>
                      {card.status === 'ACTIVE' ? (
                        <Badge tone="success">{t('admin.card.active')}</Badge>
                      ) : card.status === 'CLOSING' ? (
                        <Badge tone="warning">{t('admin.card.closing')}</Badge>
                      ) : (
                        <Badge tone="warning" icon={<Snowflake size={12} />} dot={false}>
                          {card.freezeReason === 'NEGATIVE_BALANCE'
                            ? t('admin.users.badge.negative')
                            : card.freezeReason === 'BY_OPERATOR'
                              ? t('admin.userDrawer.frozenByOperator')
                              : t('admin.card.frozen')}
                        </Badge>
                      )}
                    </TD>
                    <TD align="numeric">
                      <Amount value={card.applied} currency="USD" size="caption" />
                    </TD>
                    <TD align="numeric">
                      <Amount value={card.spent} currency="USD" size="caption" />
                    </TD>
                    <TD align="numeric">
                      <Amount value={card.available} currency="USD" size="caption" />
                    </TD>
                    <TD align="actions">
                      <div className={styles.actionsCell}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/admin/cards?open=${card.id}`)}
                        >
                          {t('admin.action.open')}
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {canceledCards.length > 0 ? (
              <p className={styles.kpiHint}>
                {t('admin.userDrawer.canceledHint', { count: canceledCards.length })}
              </p>
            ) : null}
          </Card>

          <Card density="dense">
            <CardHeader
              title={t('admin.userDrawer.historyTitle')}
              subtitle={t('admin.userDrawer.historySubtitle')}
            />
            {history.length === 0 ? (
              <p className={styles.muted}>{t('admin.userDrawer.noOperations')}</p>
            ) : (
              <List density="dense">
                {history.map((tx) => (
                  <ListRow
                    key={tx.id}
                    media={<CreditCard size={18} />}
                    title={tx.merchant}
                    subtitle={`${formatDateTime(locale, tx.at)} · •••• ${tx.cardLast4}`}
                    trailing={
                      <Amount
                        value={tx.amount}
                        currency={tx.currency}
                        size="caption"
                        struck={tx.status === 'declined' || tx.status === 'reversed'}
                      />
                    }
                    trailingNote={tx.localAmount ? `${tx.localAmount} ${tx.localCurrency}` : undefined}
                  />
                ))}
              </List>
            )}
          </Card>
        </div>

        <div className={styles.stack}>
          <Card density="dense">
            <CardHeader title={t('admin.userDrawer.profile')} />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.col.company')}</span>
                <span className={styles.rowValue}>{companyName(user.companyId)}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Email</span>
                <span className={styles.rowValue}>{user.email}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Telegram</span>
                <span className={styles.rowValue}>{user.telegram ?? t('admin.userDrawer.notLinked')}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.col.oxenStatus')}</span>
                <span className={styles.rowValue}>{user.oxenStatus ?? t('admin.userDrawer.notCreated')}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.userDrawer.createdAt')}</span>
                <span className={styles.rowValue}>{formatDateTime(locale, user.createdAt)}</span>
              </div>
            </div>
          </Card>

          <Card density="dense">
            <CardHeader
              title={t('admin.userDrawer.feesTitle')}
              subtitle={t('admin.userDrawer.feesSubtitle')}
            />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.fees.colDeposit')}</span>
                <span className={styles.rowValue}>
                  {t('admin.userDrawer.globalRate', { bps: FEES.deposit.bps })}
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.fees.colWithdrawal')}</span>
                <span className={styles.rowValue}>
                  {t('admin.userDrawer.globalRate', { bps: FEES.withdrawal.bps })}
                </span>
              </div>
            </div>
            {can('MANAGE_SETTINGS') ? (
              <div className={styles.kpiRows}>
                <Button variant="secondary" size="sm" fullWidth>
                  {t('admin.userDrawer.setRates')}
                </Button>
              </div>
            ) : null}
          </Card>

          <Card density="dense">
            <CardHeader title={t('admin.userDrawer.otherActions')} />
            <div className={styles.stackTight}>
              {user.oxenStatus === null && can('MANAGE_USERS') ? (
                <Button variant="secondary" size="sm" fullWidth iconStart={<UserCheck size={16} />}>
                  {t('admin.userDrawer.createInOxen')}
                </Button>
              ) : null}
              {can('MANAGE_USERS') ? (
                <>
                  <Button variant="secondary" size="sm" fullWidth iconStart={<Snowflake size={16} />}>
                    {t('admin.userDrawer.freezeAll')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    iconStart={<KeyRound size={16} />}
                    onClick={() => setDialog('reset2fa')}
                  >
                    {t('admin.userDrawer.reset2fa')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    fullWidth
                    iconStart={<LogOut size={16} />}
                    onClick={() => setDialog('offboard')}
                  >
                    {t('admin.userDrawer.offboard')}
                  </Button>
                </>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
        </>
      ) : null}
    </Drawer>

      {/* --- Сброс второго фактора ------------------------------------- */}
      <Modal
        open={dialog === 'reset2fa'}
        onClose={() => setDialog(null)}
        title={t('admin.userDrawer.reset2faTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t('admin.userDrawer.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDialog(null)
                setNotice(t('admin.userDrawer.reset2faNotice'))
              }}
            >
              {t('admin.userDrawer.reset')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <Toast
            tone="warning"
            title={t('admin.userDrawer.reset2faWarnTitle')}
            text={t('admin.userDrawer.reset2faWarnText')}
          />
          <p className={styles.muted}>{t('admin.userDrawer.reset2faHint')}</p>
        </div>
      </Modal>

      {/* --- Вывод средств -------------------------------------------- */}
      <Modal
        open={dialog === 'withdraw'}
        onClose={() => setDialog(null)}
        title={t('admin.userDrawer.withdrawTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t('admin.userDrawer.cancel')}
            </Button>
            <Button
              onClick={() => {
                setDialog(null)
                setNotice(t('admin.userDrawer.withdrawNotice'))
              }}
            >
              {t('admin.userDrawer.reduceBalance')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <Input label={t('admin.userDrawer.withdrawAmount')} numeric placeholder="0.00" />
          <div className={styles.rows}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t('admin.userDrawer.withdrawFee')}</span>
              <span className={styles.rowValue}>{t('admin.userDrawer.bps', { bps: FEES.withdrawal.bps })}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t('admin.userDrawer.minAmount')}</span>
              <span className={styles.rowValue}>{FEES.minWithdrawal} USD</span>
            </div>
          </div>
          <Toast
            tone="warning"
            title={t('admin.userDrawer.noTransferTitle')}
            text={t('admin.userDrawer.noTransferText')}
          />
        </div>
      </Modal>

      {/* --- Корректировка баланса ------------------------------------ */}
      <Modal
        open={dialog === 'adjust'}
        onClose={() => setDialog(null)}
        title={t('admin.userDrawer.adjustTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t('admin.userDrawer.cancel')}
            </Button>
            <Button
              variant="danger"
              /* Необратимое действие подтверждается повторным вводом суммы,
                 а не просто «ОК». */
              disabled={adjustAmount.length === 0 || adjustAmount !== adjustRepeat}
              onClick={() => {
                setDialog(null)
                setNotice(t('admin.userDrawer.adjustNotice'))
              }}
            >
              {t('admin.userDrawer.adjustSubmit')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <Toast
            tone="danger"
            title={t('admin.userDrawer.adjustWarnTitle')}
            text={t('admin.userDrawer.adjustWarnText')}
          />
          <Input
            label={t('admin.userDrawer.adjustAmount')}
            numeric
            value={adjustAmount}
            onChange={(e) => setAdjustAmount(e.target.value)}
            placeholder={t('admin.userDrawer.adjustPlaceholder')}
          />
          <Input
            label={t('admin.userDrawer.adjustRepeat')}
            numeric
            value={adjustRepeat}
            onChange={(e) => setAdjustRepeat(e.target.value)}
            error={
              adjustRepeat.length > 0 && adjustRepeat !== adjustAmount
                ? t('admin.userDrawer.adjustMismatch')
                : undefined
            }
          />
          <Textarea
            label={t('admin.userDrawer.reason')}
            required
            placeholder={t('admin.userDrawer.reasonRequired')}
          />
        </div>
      </Modal>

      {/* --- Блокировка ------------------------------------------------ */}
      <Modal
        open={dialog === 'block'}
        onClose={() => setDialog(null)}
        title={
          user?.status === 'BLOCKED'
            ? t('admin.userDrawer.unblockTitle')
            : t('admin.userDrawer.blockTitle')
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t('admin.userDrawer.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDialog(null)
                setNotice(t('admin.userDrawer.blockNotice'))
              }}
            >
              {user?.status === 'BLOCKED'
                ? t('admin.userDrawer.unblock')
                : t('admin.userDrawer.block')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <p className={styles.muted}>{t('admin.userDrawer.blockText')}</p>
          {/* Блокировка обратима, поэтому подтверждения вводом значения не
              требует — достаточно обязательной причины. */}
          <Textarea
            label={t('admin.userDrawer.reason')}
            required
            placeholder={t('admin.userDrawer.blockReasonPlaceholder')}
          />
        </div>
      </Modal>

      {/* --- Уход насовсем --------------------------------------------- */}
      <Modal
        open={dialog === 'offboard'}
        onClose={() => setDialog(null)}
        title={t('admin.userDrawer.offboardTitle')}
        footer={
          <Button variant="secondary" onClick={() => setDialog(null)}>
            {t('admin.userDrawer.understood')}
          </Button>
        }
      >
        <div className={styles.stack}>
          <p className={styles.muted}>{t('admin.userDrawer.offboardLead')}</p>
          <ol className={styles.muted}>
            <li>{t('admin.userDrawer.offboard1')}</li>
            <li>{t('admin.userDrawer.offboard2')}</li>
            <li>{t('admin.userDrawer.offboard3')}</li>
            <li>{t('admin.userDrawer.offboard4')}</li>
            <li>{t('admin.userDrawer.offboard5')}</li>
          </ol>
          <Toast
            tone="warning"
            title={t('admin.userDrawer.offboardWarnTitle')}
            text={t('admin.userDrawer.offboardWarnText')}
          />
        </div>
      </Modal>
    </>
  )
}

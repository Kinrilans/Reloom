'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Ban,
  CreditCard,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
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
import type { UserCardView } from '@/server/admin/users'
import { useAdmin } from '../../_store/AdminStore'
import {
  adjustAction,
  blockAction,
  createCardholderAction,
  freezeAllCardsAction,
  issueCardAction,
  resetSecondFactorAction,
  setFeesAction,
  unblockAction,
  withdrawAction,
  withdrawPreviewAction,
} from '../actions'
import styles from '../../admin.module.css'

/**
 * Карточка пользователя — боковой панелью из списка.
 *
 * Отдельной страницей она уводила из списка: оператор разбирает
 * обращения подряд и терял фильтры, страницу и место прокрутки.
 *
 * Реквизиты карт оператору **не показываются никогда**: нет сценария,
 * в котором оператору нужен чужой номер карты.
 *
 * Абсолютное значение лимита оператор не вводит нигде. Он вводит
 * «вывести», «скорректировать», «выделить на новую карту», а потолок
 * считает код.
 */

type Dialog = 'withdraw' | 'adjust' | 'block' | 'offboard' | 'reset2fa' | 'issue' | 'fees' | null

export interface UserDrawerProps {
  user: UserCardView | null
  globalFees: { depositBps: number; withdrawalBps: number }
  onClose: () => void
}

export function UserDrawer({ user, globalFees, onClose }: UserDrawerProps) {
  const { locale, t } = useI18n()
  const { can } = useAdmin()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [dialog, setDialog] = useState<Dialog>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawPreview, setWithdrawPreview] = useState<{
    fee: string
    total: string
    net: string
    bps: number
    belowMinimum: boolean
    minWithdrawal: string
    insufficient: boolean
  } | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustRepeat, setAdjustRepeat] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [issueAmount, setIssueAmount] = useState('')
  const [depositBps, setDepositBps] = useState('')
  const [withdrawalBps, setWithdrawalBps] = useState('')

  // Следующий пользователь открывается с чистого состояния: иначе
  // в окнах остаются суммы и причины от предыдущего.
  useEffect(() => {
    setDialog(null)
    setNotice(null)
    setError(null)
    setWithdrawAmount('')
    setWithdrawPreview(null)
    setAdjustAmount('')
    setAdjustRepeat('')
    setAdjustReason('')
    setBlockReason('')
    setIssueAmount('')
    setDepositBps(user?.depositFeeBps === null ? '' : String(user?.depositFeeBps ?? ''))
    setWithdrawalBps(user?.withdrawalFeeBps === null ? '' : String(user?.withdrawalFeeBps ?? ''))
  }, [user?.id, user?.depositFeeBps, user?.withdrawalFeeBps])

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    successMessage: string,
  ): void {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setError(result.error ?? 'error')
        return
      }
      setDialog(null)
      setNotice(successMessage)
      router.refresh()
    })
  }

  return (
    <>
      <Drawer
        open={user !== null}
        onClose={onClose}
        title={user?.name ?? t('admin.userDrawer.fallback')}
        subtitle={user?.companyName}
        footer={
          user ? (
            <>
              {can('WITHDRAW') ? (
                <Button
                  variant="secondary"
                  iconStart={<Wallet size={16} />}
                  onClick={() => setDialog('withdraw')}
                >
                  {t('admin.userDrawer.withdraw')}
                </Button>
              ) : null}
              {can('ADJUST_BALANCE') ? (
                <Button
                  variant="secondary"
                  iconStart={<Pencil size={16} />}
                  onClick={() => setDialog('adjust')}
                >
                  {t('admin.userDrawer.adjust')}
                </Button>
              ) : null}
              {can('MANAGE_USERS') ? (
                <Button
                  variant="danger"
                  iconStart={<Ban size={16} />}
                  onClick={() => setDialog('block')}
                >
                  {user.status === 'BLOCKED'
                    ? t('admin.userDrawer.unblock')
                    : t('admin.userDrawer.block')}
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {user ? (
          <>
            {notice ? (
              <Toast tone="success" title={notice} onClose={() => setNotice(null)} />
            ) : null}
            {error && dialog === null ? <Toast tone="danger" title={error} /> : null}

            {user.status === 'BLOCKED' ? (
              <Toast
                tone="neutral"
                title={t('admin.userDrawer.blockedTitle')}
                text={user.blockReason ?? t('admin.userDrawer.blockedText')}
              />
            ) : null}

            {user.negative ? (
              <Toast
                tone="danger"
                title={t('admin.userDrawer.negativeTitle')}
                text={t('admin.userDrawer.negativeText')}
              />
            ) : null}

            {user.oxenStatus === 'NEEDS_REVIEW' ||
            user.oxenStatus === 'NEEDS_INFO' ||
            user.oxenStatus === 'REJECTED' ? (
              <Toast
                tone="warning"
                title={t('admin.userDrawer.stuckTitle')}
                text={t('admin.userDrawer.stuckText')}
              />
            ) : null}

            {user.pendingTransfers.length > 0 ? (
              <Toast
                tone="warning"
                title={t('admin.userDrawer.transferPendingTitle')}
                text={t('admin.userDrawer.transferPendingText')}
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
                    action={
                      can('MANAGE_USERS') && user.oxenStatus === 'APPROVED' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          iconStart={<Plus size={16} />}
                          onClick={() => setDialog('issue')}
                        >
                          {t('admin.userDrawer.issueCard')}
                        </Button>
                      ) : null
                    }
                  />
                  {user.cards.length === 0 ? (
                    <p className={styles.muted}>{t('admin.userDrawer.noCards')}</p>
                  ) : (
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
                        {user.cards.map((card) => (
                          <TR key={card.id}>
                            <TD primary>•••• {card.last4 ?? '????'}</TD>
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
                                      : card.freezeReason === 'BY_BLOCK'
                                        ? t('admin.userDrawer.frozenByBlock')
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
                  )}
                  {user.canceledCards.length > 0 ? (
                    <p className={styles.kpiHint}>
                      {t('admin.userDrawer.canceledHint', { count: user.canceledCards.length })}
                    </p>
                  ) : null}
                </Card>

                <Card density="dense">
                  <CardHeader
                    title={t('admin.userDrawer.historyTitle')}
                    subtitle={t('admin.userDrawer.historySubtitle')}
                  />
                  {user.history.length === 0 ? (
                    <p className={styles.muted}>{t('admin.userDrawer.noOperations')}</p>
                  ) : (
                    <List density="dense">
                      {user.history.map((item) => (
                        <ListRow
                          key={item.id}
                          media={<CreditCard size={18} />}
                          title={t(`admin.ledger.${item.type}`)}
                          subtitle={formatDateTime(locale, item.at)}
                          trailing={<Amount value={item.amount} currency="USD" size="caption" />}
                          trailingNote={item.reason ?? undefined}
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
                      <span className={styles.rowValue}>{user.companyName}</span>
                    </div>
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>Email</span>
                      <span className={styles.rowValue}>{user.email ?? '—'}</span>
                    </div>
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>Telegram</span>
                      <span className={styles.rowValue}>
                        {user.telegram ?? t('admin.userDrawer.notLinked')}
                      </span>
                    </div>
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>{t('admin.col.oxenStatus')}</span>
                      <span className={styles.rowValue}>
                        {user.oxenStatus ?? t('admin.userDrawer.notCreated')}
                      </span>
                    </div>
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>{t('admin.userDrawer.createdAt')}</span>
                      <span className={styles.rowValue}>
                        {formatDateTime(locale, user.createdAt)}
                      </span>
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
                        {user.depositFeeBps === null
                          ? t('admin.userDrawer.globalRate', { bps: globalFees.depositBps })
                          : t('admin.userDrawer.ownRate', { bps: user.depositFeeBps })}
                      </span>
                    </div>
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>{t('admin.fees.colWithdrawal')}</span>
                      <span className={styles.rowValue}>
                        {user.withdrawalFeeBps === null
                          ? t('admin.userDrawer.globalRate', { bps: globalFees.withdrawalBps })
                          : t('admin.userDrawer.ownRate', { bps: user.withdrawalFeeBps })}
                      </span>
                    </div>
                  </div>
                  {can('MANAGE_SETTINGS') ? (
                    <div className={styles.kpiRows}>
                      <Button
                        variant="secondary"
                        size="sm"
                        fullWidth
                        onClick={() => setDialog('fees')}
                      >
                        {t('admin.userDrawer.setRates')}
                      </Button>
                    </div>
                  ) : null}
                </Card>

                <Card density="dense">
                  <CardHeader title={t('admin.userDrawer.otherActions')} />
                  <div className={styles.stackTight}>
                    {user.oxenCardholderId === null && can('MANAGE_USERS') ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        fullWidth
                        disabled={pending}
                        iconStart={<UserCheck size={16} />}
                        onClick={() =>
                          run(
                            () => createCardholderAction(user.id),
                            t('admin.userDrawer.createInOxenNotice'),
                          )
                        }
                      >
                        {t('admin.userDrawer.createInOxen')}
                      </Button>
                    ) : null}
                    {can('MANAGE_USERS') ? (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          fullWidth
                          disabled={pending || user.cards.length === 0}
                          iconStart={<Snowflake size={16} />}
                          onClick={() =>
                            run(
                              () => freezeAllCardsAction(user.id),
                              t('admin.userDrawer.freezeAllNotice'),
                            )
                          }
                        >
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

      {/* --- Выпуск карты ---------------------------------------------- */}
      <Modal
        open={dialog === 'issue' && user !== null}
        onClose={() => setDialog(null)}
        title={t('admin.userDrawer.issueTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t('admin.userDrawer.cancel')}
            </Button>
            <Button
              disabled={pending || issueAmount.trim() === '' || user === null}
              onClick={() => {
                if (!user) return
                run(
                  () => issueCardAction({ userId: user.id, amount: issueAmount }),
                  t('admin.userDrawer.issueNotice'),
                )
              }}
            >
              {t('admin.userDrawer.issueSubmit')}
            </Button>
          </>
        }
      >
        {user ? (
          <div className={styles.stack}>
            {error ? <Toast tone="danger" title={error} /> : null}
            {/* Вводится «сколько выделить», а не потолок: потолок —
                производная величина, и руками его не задают. */}
            <Input
              label={t('admin.userDrawer.issueAmount')}
              numeric
              value={issueAmount}
              onChange={(e) => setIssueAmount(e.target.value)}
              placeholder="0.00"
              hint={t('admin.userDrawer.issueAmountHint', { amount: user.unallocated })}
            />
            <Toast
              tone="neutral"
              title={t('admin.userDrawer.issueNoteTitle')}
              text={t('admin.userDrawer.issueNoteText')}
            />
          </div>
        ) : null}
      </Modal>

      {/* --- Индивидуальные ставки ------------------------------------- */}
      <Modal
        open={dialog === 'fees' && user !== null}
        onClose={() => setDialog(null)}
        title={t('admin.userDrawer.ratesTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t('admin.userDrawer.cancel')}
            </Button>
            <Button
              disabled={pending || user === null}
              onClick={() => {
                if (!user) return
                run(
                  () =>
                    setFeesAction({
                      userId: user.id,
                      depositBps,
                      withdrawalBps,
                    }),
                  t('admin.userDrawer.ratesNotice'),
                )
              }}
            >
              {t('admin.userDrawer.save')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          {error ? <Toast tone="danger" title={error} /> : null}
          {/* Индивидуальная ставка ЗАМЕНЯЕТ глобальную, а не
              складывается с ней. Это написано прямо здесь: оператор,
              который решит иначе, ошибётся на величину комиссии. */}
          <Toast
            tone="neutral"
            title={t('admin.userDrawer.ratesReplaceTitle')}
            text={t('admin.userDrawer.ratesReplaceText')}
          />
          <Input
            label={t('admin.fees.colDeposit')}
            numeric
            value={depositBps}
            onChange={(e) => setDepositBps(e.target.value)}
            hint={t('admin.userDrawer.ratesHint', { bps: globalFees.depositBps })}
          />
          <Input
            label={t('admin.fees.colWithdrawal')}
            numeric
            value={withdrawalBps}
            onChange={(e) => setWithdrawalBps(e.target.value)}
            hint={t('admin.userDrawer.ratesHint', { bps: globalFees.withdrawalBps })}
          />
        </div>
      </Modal>

      {/* --- Сброс второго фактора ------------------------------------- */}
      <Modal
        open={dialog === 'reset2fa' && user !== null}
        onClose={() => setDialog(null)}
        title={t('admin.userDrawer.reset2faTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t('admin.userDrawer.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={pending || user === null}
              onClick={() => {
                if (!user) return
                run(
                  () => resetSecondFactorAction(user.id),
                  t('admin.userDrawer.reset2faNotice'),
                )
              }}
            >
              {t('admin.userDrawer.reset')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          {error ? <Toast tone="danger" title={error} /> : null}
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
        open={dialog === 'withdraw' && user !== null}
        onClose={() => setDialog(null)}
        title={t('admin.userDrawer.withdrawTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t('admin.userDrawer.cancel')}
            </Button>
            <Button
              disabled={
                pending ||
                user === null ||
                withdrawPreview === null ||
                withdrawPreview.insufficient ||
                withdrawPreview.belowMinimum
              }
              onClick={() => {
                if (!user) return
                run(
                  () => withdrawAction({ userId: user.id, amount: withdrawAmount }),
                  t('admin.userDrawer.withdrawNotice'),
                )
              }}
            >
              {t('admin.userDrawer.reduceBalance')}
            </Button>
          </>
        }
      >
        {user ? (
          <div className={styles.stack}>
            {error ? <Toast tone="danger" title={error} /> : null}
            <Input
              label={t('admin.userDrawer.withdrawAmount')}
              numeric
              placeholder="0.00"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              onBlur={() => {
                startTransition(async () => {
                  const result = await withdrawPreviewAction({
                    userId: user.id,
                    amount: withdrawAmount,
                  })
                  setWithdrawPreview(result.ok ? result : null)
                  setError(result.ok ? null : t('admin.userDrawer.badAmount'))
                })
              }}
            />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.userDrawer.withdrawFee')}</span>
                <span className={styles.rowValue}>
                  {withdrawPreview
                    ? t('admin.userDrawer.bps', { bps: withdrawPreview.bps })
                    : t('admin.userDrawer.bps', { bps: globalFees.withdrawalBps })}
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.fees.weHold')}</span>
                <span className={styles.rowValue}>
                  <Amount value={withdrawPreview?.fee ?? '—'} currency="USD" size="caption" />
                </span>
              </div>
              <div className={[styles.row, styles.rowTotal].join(' ')}>
                {/* С баланса уходит сумма ВМЕСТЕ с комиссией: при
                    выводе она берётся сверх, а не внутри. */}
                <span className={styles.rowLabel}>{t('admin.userDrawer.withdrawTotal')}</span>
                <span className={styles.rowValue}>
                  <Amount value={withdrawPreview?.total ?? '—'} currency="USD" size="kpi" />
                </span>
              </div>
            </div>
            {withdrawPreview?.belowMinimum ? (
              <Toast
                tone="danger"
                title={t('admin.userDrawer.belowMinTitle', {
                  amount: withdrawPreview.minWithdrawal,
                })}
                text={t('admin.userDrawer.belowMinText')}
              />
            ) : null}
            {withdrawPreview?.insufficient ? (
              <Toast
                tone="danger"
                title={t('admin.userDrawer.insufficientTitle')}
                text={t('admin.userDrawer.insufficientText')}
              />
            ) : null}
            <Toast
              tone="warning"
              title={t('admin.userDrawer.noTransferTitle')}
              text={t('admin.userDrawer.noTransferText')}
            />
          </div>
        ) : null}
      </Modal>

      {/* --- Корректировка баланса ------------------------------------ */}
      <Modal
        open={dialog === 'adjust' && user !== null}
        onClose={() => setDialog(null)}
        title={t('admin.userDrawer.adjustTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t('admin.userDrawer.cancel')}
            </Button>
            <Button
              variant="danger"
              /* Необратимое действие подтверждается повторным вводом
                 суммы, а не просто «ОК». */
              disabled={
                pending ||
                user === null ||
                adjustAmount.length === 0 ||
                adjustAmount !== adjustRepeat ||
                adjustReason.trim() === ''
              }
              onClick={() => {
                if (!user) return
                run(
                  () =>
                    adjustAction({
                      userId: user.id,
                      amount: adjustAmount,
                      reason: adjustReason,
                    }),
                  t('admin.userDrawer.adjustNotice'),
                )
              }}
            >
              {t('admin.userDrawer.adjustSubmit')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          {error ? <Toast tone="danger" title={error} /> : null}
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
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            placeholder={t('admin.userDrawer.reasonRequired')}
          />
        </div>
      </Modal>

      {/* --- Блокировка ------------------------------------------------ */}
      <Modal
        open={dialog === 'block' && user !== null}
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
              disabled={
                pending ||
                user === null ||
                (user.status !== 'BLOCKED' && blockReason.trim() === '')
              }
              onClick={() => {
                if (!user) return
                if (user.status === 'BLOCKED') {
                  run(() => unblockAction(user.id), t('admin.userDrawer.unblockNotice'))
                  return
                }
                run(
                  () => blockAction({ userId: user.id, reason: blockReason }),
                  t('admin.userDrawer.blockNotice'),
                )
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
          {error ? <Toast tone="danger" title={error} /> : null}
          <p className={styles.muted}>
            {user?.status === 'BLOCKED'
              ? t('admin.userDrawer.unblockText')
              : t('admin.userDrawer.blockText')}
          </p>
          {/* Блокировка обратима, поэтому подтверждения вводом
              значения не требует — достаточно обязательной причины. */}
          {user?.status === 'BLOCKED' ? null : (
            <Textarea
              label={t('admin.userDrawer.reason')}
              required
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder={t('admin.userDrawer.blockReasonPlaceholder')}
            />
          )}
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

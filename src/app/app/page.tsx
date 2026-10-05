'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDownToLine, ArrowLeftRight, Plus, Wallet } from 'lucide-react'
import { Amount, Button, Card, EmptyState, List, Toast } from '@/ui'
import { formatTime, useI18n } from '@/i18n'
import { useStore } from '@/fixtures/store'
import { AppShell } from './AppShell'
import { CardFace } from './_components/CardFace'
import { OperationRow } from './_components/OperationRow'
import { ProfileNotice } from './_components/ProfileNotice'
import shell from './AppShell.module.css'
import styles from './home.module.css'

export default function HomePage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const { scenario, activeCards, canIssue } = useStore()

  const blocked = scenario.profileStatus === 'BLOCKED'
  const hasCards = activeCards.length > 0
  const atCardLimit = activeCards.length >= 2

  return (
    <AppShell nav>
      <div className={styles.hero}>
        <div className={styles.balanceLabel}>{t('home.balance')}</div>
        <Amount value={scenario.balance} currency={scenario.currency} size="display" />

        {/* Ограничение со стороны пула компании НЕ раскрывается: состояние
            пула — наша кухня, повлиять на неё человек не может. */}
        {scenario.spendableLimitedBy === 'pool' ? null : scenario.spendable ? (
          <div className={styles.spendable}>
            {t('home.spendable')}
            <Amount value={scenario.spendable} currency={scenario.currency} size="caption" />
          </div>
        ) : null}
      </div>

      <ProfileNotice />

      {scenario.offlineSince ? (
        <Toast
          tone="neutral"
          title={t('offline.title')}
          text={`${t('offline.text')} ${t('offline.stale', {
            time: formatTime(locale, scenario.offlineSince),
          })}`}
        />
      ) : null}

      {scenario.spendableLimitedBy === 'pool' ? (
        <Toast tone="warning" title={t('pool.title')} text={t('pool.text')} />
      ) : null}

      {scenario.shortfall ? (
        <Toast
          tone="danger"
          title={t('negative.title')}
          text={t('negative.text', { amount: `${scenario.shortfall} ${scenario.currency}` })}
          actions={
            <Button size="sm" variant="secondary" onClick={() => router.push('/app/topup')}>
              {t('action.topup')}
            </Button>
          }
        />
      ) : null}

      {hasCards ? (
        <>
          <div className={styles.cards}>
            {activeCards.map((card) => (
              <div
                key={card.id}
                className={[
                  styles.cardSlide,
                  activeCards.length === 1 ? styles.cardSlideSingle : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <CardFace card={card} onClick={() => router.push(`/app/card/${card.id}`)} />
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <Link className={styles.action} href="/app/topup">
              <span className={styles.actionIcon}>
                <ArrowDownToLine size={20} />
              </span>
              {t('action.topup')}
            </Link>
            <button
              type="button"
              className={styles.action}
              disabled={activeCards.length < 2 || blocked}
              onClick={() => router.push('/app/transfer')}
            >
              <span className={styles.actionIcon}>
                <ArrowLeftRight size={20} />
              </span>
              {t('action.transfer')}
            </button>
            <button
              type="button"
              className={styles.action}
              disabled={!canIssue || blocked}
              onClick={() => router.push('/app/issue')}
            >
              <span className={styles.actionIcon}>
                <Plus size={20} />
              </span>
              {t('action.issue')}
            </button>
          </div>

          {atCardLimit ? <p className={styles.actionNote}>{t('card.limit.text')}</p> : null}
        </>
      ) : scenario.balance === '0.00' ? (
        <Card density="flush">
          <EmptyState
            icon={<Wallet size={24} />}
            title={t('home.empty.title')}
            action={
              <Button onClick={() => router.push('/app/topup')}>{t('home.empty.action')}</Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <p className={shell.muted}>
            {t('home.hasBalance.text', {
              amount: `${scenario.balance} ${scenario.currency}`,
            })}
          </p>
          <div className={styles.inlineActions}>
            <Button onClick={() => router.push('/app/issue')} disabled={!canIssue}>
              {t('action.issue')}
            </Button>
            <Button variant="secondary" onClick={() => router.push('/app/topup')}>
              {t('action.topup')}
            </Button>
          </div>
        </Card>
      )}

      {scenario.operations.length > 0 ? (
        <>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>{t('home.operations')}</span>
            <Link href="/app/history">
              <Button variant="ghost" size="sm">
                {t('common.all')}
              </Button>
            </Link>
          </div>
          <List>
            {scenario.operations.slice(0, 5).map((op) => (
              <OperationRow key={op.id} operation={op} />
            ))}
          </List>
        </>
      ) : null}
    </AppShell>
  )
}

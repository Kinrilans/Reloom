'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Input, Select, Toast } from '@/ui'
import type { SelectOption } from '@/ui'
import { useT } from '@/i18n'
import { useDemoState } from '@/fixtures/demoState'
import { useStore } from '@/fixtures/store'
import { AppShell } from '../AppShell'
import styles from '../screens.module.css'

type Step = 'form' | 'confirm' | 'progress' | 'stuck' | 'done'

export default function TransferPage() {
  const t = useT()
  const router = useRouter()
  const demo = useDemoState()
  const { activeCards, completeTransfer } = useStore()

  const [step, setStep] = useState<Step>('form')
  const [fromId, setFromId] = useState(activeCards[0]?.id ?? '')
  const [toId, setToId] = useState(activeCards[1]?.id ?? '')
  // Значение по умолчанию совпадает с тем, что заложено в демо-данных
  // после перевода: прототип не считает остатки, он их подменяет.
  const [amount, setAmount] = useState('200.00')

  useEffect(() => {
    if (demo === 'progress') setStep('progress')
    if (demo === 'stuck') setStep('stuck')
  }, [demo])

  useEffect(() => {
    if (step !== 'progress') return
    const timer = window.setTimeout(() => {
      completeTransfer()
      setStep('done')
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [step, completeTransfer])

  const from = activeCards.find((c) => c.id === fromId)
  const to = activeCards.find((c) => c.id === toId)

  const options: SelectOption[] = activeCards.map((c) => ({
    value: c.id,
    label: `•••• ${c.last4} · ${c.isPrimary ? t('card.primary') : t('card.child')}`,
  }))

  if (step === 'stuck') {
    return (
      <AppShell title={t('transfer.title')} back>
        <div className={styles.stack}>
          {/* Деньги не потеряны: они либо остались на источнике, либо уже
              доехали. Система добирает операцию сама. */}
          <Toast tone="warning" title={t('transfer.stuck.title')} text={t('transfer.stuck.text')} />
          <p className={styles.note}>{t('transfer.blocked')}</p>
          <div className={styles.footer}>
            <Button fullWidth variant="secondary" onClick={() => router.push('/app')}>
              {t('nav.home')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  if (step === 'progress') {
    return (
      <AppShell title={t('transfer.title')}>
        <div className={styles.stack}>
          <h1 className={styles.title}>{t('transfer.progress')}</h1>
          <p className={styles.text}>{t('transfer.blocked')}</p>
        </div>
      </AppShell>
    )
  }

  if (step === 'done') {
    return (
      <AppShell title={t('transfer.title')}>
        <div className={styles.stack}>
          <Toast tone="success" title={t('common.done')} />
          <div className={styles.footer}>
            <Button fullWidth onClick={() => router.push('/app')}>
              {t('nav.home')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  if (step === 'confirm') {
    return (
      <AppShell title={t('transfer.title')} back>
        <div className={styles.stack}>
          <h1 className={styles.title}>
            {t('transfer.confirm.title', { amount: `${amount} ${from?.currency ?? 'USD'}` })}
          </h1>
          <p className={styles.text}>
            {t('transfer.confirm.text', {
              from: `•••• ${from?.last4 ?? ''}`,
              to: `•••• ${to?.last4 ?? ''}`,
            })}
          </p>
          <div className={styles.footer}>
            <Button fullWidth onClick={() => setStep('progress')}>
              {t('common.confirm')}
            </Button>
            <Button variant="ghost" fullWidth onClick={() => setStep('form')}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  const blocked = Boolean(from?.transferPending)

  return (
    <AppShell back>
      <div className={styles.stack}>
        <h1 className={styles.title}>{t('transfer.title')}</h1>

        <Card>
          <div className={styles.stack}>
            <Select
              label={t('transfer.from')}
              options={options}
              value={fromId}
              onChange={setFromId}
            />
            <Select label={t('transfer.to')} options={options} value={toId} onChange={setToId} />
            <Input
              label={t('common.amount')}
              numeric
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              hint={
                from
                  ? t('transfer.hint', { amount: `${from.available} ${from.currency}` })
                  : undefined
              }
            />
          </div>
        </Card>

        {/* Второй перевод той же картой заблокирован, пока не завершён
            первый (docs/flows-user.md). */}
        {blocked ? <Toast tone="warning" title={t('transfer.blocked')} /> : null}

        <div className={styles.footer}>
          <Button
            fullWidth
            disabled={blocked || !from || !to || fromId === toId}
            onClick={() => setStep('confirm')}
          >
            {t('transfer.action')}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

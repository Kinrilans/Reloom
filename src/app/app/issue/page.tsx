'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, TriangleAlert } from 'lucide-react'
import { Button, Card, EmptyState, Input, Skeleton, Toast } from '@/ui'
import { useT } from '@/i18n'
import { useDemoState } from '@/fixtures/demoState'
import { useStore } from '@/fixtures/store'
import { AppShell } from '../AppShell'
import styles from '../screens.module.css'

type Step = 'form' | 'progress' | 'failed' | 'done'

export default function IssuePage() {
  const t = useT()
  const router = useRouter()
  const { activeCards, canIssue, issueCard } = useStore()
  const demo = useDemoState()

  const [step, setStep] = useState<Step>('form')
  const [slow, setSlow] = useState(false)
  const first = activeCards.length === 0

  useEffect(() => {
    if (demo === 'failed') setStep('failed')
  }, [demo])

  // Пока карта выпускается, повторное нажатие заблокировано, а через
  // несколько секунд появляется честное «дольше обычного» (Б-4).
  useEffect(() => {
    if (step !== 'progress') return
    const slowTimer = window.setTimeout(() => setSlow(true), 2200)
    const doneTimer = window.setTimeout(() => {
      issueCard()
      setStep('done')
    }, 3600)
    return () => {
      window.clearTimeout(slowTimer)
      window.clearTimeout(doneTimer)
    }
  }, [step, issueCard])

  if (step === 'progress') {
    return (
      <AppShell title={t('issue.title')}>
        <div className={styles.stack}>
          <h1 className={styles.title}>{t('issue.progress')}</h1>
          {/* Успех не показываем до подтверждённого чтения: пока ответа нет,
              на экране именно ожидание. */}
          <Card>
            <Skeleton height="140px" />
          </Card>
          {slow ? <p className={styles.note}>{t('issue.slow')}</p> : null}
        </div>
      </AppShell>
    )
  }

  if (step === 'failed') {
    return (
      <AppShell title={t('issue.title')} back>
        <Card density="flush">
          <EmptyState
            tone="danger"
            icon={<TriangleAlert size={24} />}
            title={t('issue.failed.title')}
            /* Первая половина фразы обязательна: при сбое в денежной
               операции человек прежде всего думает, что потерял деньги. */
            text={t('issue.failed.text')}
            action={<Button onClick={() => setStep('form')}>{t('common.retry')}</Button>}
          />
        </Card>
      </AppShell>
    )
  }

  if (step === 'done') {
    return (
      <AppShell title={t('issue.title')}>
        <Card density="flush">
          <EmptyState
            icon={<CreditCard size={24} />}
            title={t('common.done')}
            action={<Button onClick={() => router.push('/app')}>{t('nav.home')}</Button>}
          />
        </Card>
      </AppShell>
    )
  }

  return (
    <AppShell back>
      <div className={styles.stack}>
        <h1 className={styles.title}>{t('issue.action')}</h1>

        {canIssue ? (
          <>
            <p className={styles.text}>{first ? t('issue.first.text') : t('issue.second.text')}</p>

            {/* У второй карты можно сразу указать, сколько перевести с главной.
                Можно оставить ноль и перевести позже. */}
            {first ? null : (
              <Input label={t('issue.second.field')} numeric defaultValue="0.00" />
            )}

            <div className={styles.footer}>
              <Button fullWidth onClick={() => setStep('progress')}>
                {t('issue.action')}
              </Button>
            </div>
          </>
        ) : (
          <Toast tone="neutral" title={t('card.limit.title')} text={t('card.limit.text')} />
        )}
      </div>
    </AppShell>
  )
}

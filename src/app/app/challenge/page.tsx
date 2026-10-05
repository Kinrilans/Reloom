'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Timer, TriangleAlert } from 'lucide-react'
import { Button, Card, EmptyState } from '@/ui'
import { useT } from '@/i18n'
import { useDemoState } from '@/fixtures/demoState'
import { DEMO } from '@/fixtures/scenarios'
import { AppShell } from '../AppShell'
import styles from '../screens.module.css'

/**
 * 3-D Secure (В-4, В-5).
 *
 * Код приходит вебхуком и доставляется пользователю приоритетной очередью,
 * вперёд всех остальных уведомлений. Обратный отсчёт обязателен: событие
 * доставляется один раз, и пропущенное придёт только догоном, когда код
 * уже протух. Просроченный код НЕ показывается как рабочий.
 */
export default function ChallengePage() {
  const t = useT()
  const router = useRouter()
  const demo = useDemoState()

  const [left, setLeft] = useState(DEMO.challenge.seconds)
  const expired = demo === 'expired' || left <= 0

  // Отсчёт времени — не денежная арифметика, его считать можно.
  useEffect(() => {
    if (expired) return
    const timer = window.setTimeout(() => setLeft((v) => v - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [left, expired])

  const minutes = Math.floor(left / 60)
  const seconds = String(Math.max(0, left % 60)).padStart(2, '0')
  const amount = `${DEMO.challenge.amount} USD`

  if (expired) {
    return (
      <AppShell title={t('challenge.title')} back>
        <Card density="flush">
          <EmptyState
            tone="danger"
            icon={<TriangleAlert size={24} />}
            title={t('challenge.expired.title')}
            text={t('challenge.expired.text', {
              amount,
              merchant: DEMO.challenge.merchant,
            })}
            action={<Button onClick={() => router.push('/app')}>{t('nav.home')}</Button>}
          />
        </Card>
      </AppShell>
    )
  }

  return (
    <AppShell title={t('challenge.title')} back>
      <div className={styles.stack}>
        <Card tone="brand" grain glow>
          <div className={styles.rowLabel}>{t('challenge.title')}</div>
          <div className={styles.secretValue}>{DEMO.challenge.code}</div>
        </Card>

        <p className={styles.text}>
          {t('challenge.purchase', { amount, merchant: DEMO.challenge.merchant })}
        </p>

        <div className={styles.countdown}>
          <Timer size={16} />
          {t('challenge.expires', { time: `${minutes}:${seconds}` })}
        </div>
      </div>
    </AppShell>
  )
}

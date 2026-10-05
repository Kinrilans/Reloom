'use client'

import { use, useEffect, useState } from 'react'
import { Check, Copy, EyeOff, Timer, TriangleAlert } from 'lucide-react'
import { Button, Card, EmptyState, Input, Toast } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { useDemoState } from '@/fixtures/demoState'
import { DEMO } from '@/fixtures/scenarios'
import { useStore } from '@/fixtures/store'
import { AppShell } from '../../../AppShell'
import styles from '../../../screens.module.css'

/**
 * Просмотр реквизитов карты.
 *
 * В продукте открытые PAN и CVV НИКОГДА не попадают на наш сервер:
 * клиент сам генерирует секрет, шифрует его публичным ключом эмитента,
 * сервер лишь проксирует шифротекст, а расшифровка идёт на устройстве
 * (docs/security.md). В прототипе шифрования нет — значения выдуманные
 * и невалидны по контрольной сумме, — но экран построен так, как он будет
 * работать: второй фактор, показ по таймеру, запрет на снимок состояния.
 */

type Step = 'ask' | 'shown' | 'hidden' | 'throttled'

export default function SecretsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t, locale } = useI18n()
  const demo = useDemoState()
  const { scenario, card } = useStore()

  const [step, setStep] = useState<Step>('ask')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [left, setLeft] = useState(DEMO.secretsTimeout)
  const [copied, setCopied] = useState<string | null>(null)

  const current = card(id)
  const quarantined = Boolean(scenario.quarantineUntil)

  useEffect(() => {
    if (demo === 'throttled') setStep('throttled')
    if (demo === 'shown') setStep('shown')
  }, [demo])

  // Обратный отсчёт до автоскрытия. Реквизиты не остаются на экране
  // навсегда: это снижает риск, что их увидит кто-то рядом.
  useEffect(() => {
    if (step !== 'shown') return
    if (left <= 0) {
      setStep('hidden')
      return
    }
    const timer = window.setTimeout(() => setLeft((v) => v - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [step, left])

  function submit() {
    // Настоящая проверка второго фактора — на сервере, с ограничением
    // попыток и блокировкой (docs/security.md). Здесь только экран.
    if (pin.length < 4) {
      setError(t('secrets.wrong', { count: 2 }))
      return
    }
    setError(undefined)
    setLeft(DEMO.secretsTimeout)
    setStep('shown')
  }

  function copy(key: string, text: string) {
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    setCopied(key)
    window.setTimeout(() => setCopied(null), 1500)
  }

  if (quarantined) {
    return (
      <AppShell title={t('secrets.title')} back>
        <Toast
          tone="warning"
          title={t('profile.quarantine.title')}
          text={t('secrets.quarantine', {
            until: formatDateTime(locale, scenario.quarantineUntil!),
          })}
        />
      </AppShell>
    )
  }

  if (step === 'throttled') {
    return (
      <AppShell title={t('secrets.title')} back>
        <Card density="flush">
          {/* Просмотр реквизитов и просмотр PIN делят общий бюджет запросов
              на карту. Пользователю знать об этом не нужно, но объяснить
              задержку надо (В-2). */}
          <EmptyState
            tone="danger"
            icon={<TriangleAlert size={24} />}
            title={t('secrets.throttled.title')}
            text={t('secrets.throttled.text', { minutes: 12 })}
          />
        </Card>
      </AppShell>
    )
  }

  if (step === 'hidden') {
    return (
      <AppShell title={t('secrets.title')} back>
        <Card density="flush">
          <EmptyState
            icon={<EyeOff size={24} />}
            title={t('secrets.hidden')}
            action={
              <Button
                onClick={() => {
                  setLeft(DEMO.secretsTimeout)
                  setStep('shown')
                }}
              >
                {t('secrets.again')}
              </Button>
            }
          />
        </Card>
      </AppShell>
    )
  }

  if (step === 'shown') {
    const fields = [
      { key: 'pan', label: t('secrets.number'), value: DEMO.pan },
      { key: 'expiry', label: t('secrets.expiry'), value: current?.expires ?? '' },
      { key: 'cvv', label: t('secrets.cvv'), value: DEMO.cvv },
    ]

    return (
      <AppShell title={t('secrets.title')} back>
        <div className={styles.stack}>
          <div className={styles.countdown}>
            <Timer size={16} />
            {t('secrets.hideIn', { seconds: left })}
          </div>

          {fields.map((field) => (
            <Card key={field.key}>
              <div className={styles.rowLabel}>{field.label}</div>
              <div className={styles.row}>
                <span className={styles.secretValue}>{field.value}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={t('common.copy')}
                  onClick={() => copy(field.key, field.value)}
                  iconStart={copied === field.key ? <Check size={18} /> : <Copy size={18} />}
                />
              </div>
            </Card>
          ))}

          <div className={styles.footer}>
            <Button variant="secondary" fullWidth onClick={() => setStep('hidden')}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={t('secrets.title')} back>
      <div className={styles.stack}>
        <h1 className={styles.title}>{t('secrets.ask')}</h1>
        <Input
          label={t('onboarding.pin.field')}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          error={error}
          onChange={(e) => setPin(e.target.value)}
        />
        <div className={styles.footer}>
          <Button fullWidth onClick={submit}>
            {t('card.show')}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

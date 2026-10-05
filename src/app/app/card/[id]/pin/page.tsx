'use client'

import { useState } from 'react'
import { Button, Card, Input, Toast } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { DEMO } from '@/fixtures/scenarios'
import { useStore } from '@/fixtures/store'
import { AppShell } from '../../../AppShell'
import styles from '../../../screens.module.css'

/**
 * PIN самой карты — не путать с PIN приложения.
 *
 * В чат бота PIN не отправляется никогда: история Telegram синхронизируется
 * между устройствами и живёт вечно (docs/flows-user.md).
 */

type Step = 'ask' | 'shown' | 'change'

export default function CardPinPage() {
  const { t, locale } = useI18n()
  const { scenario } = useStore()

  const [step, setStep] = useState<Step>('ask')
  const [pin, setPin] = useState('')

  const quarantined = Boolean(scenario.quarantineUntil)

  if (quarantined) {
    return (
      <AppShell title={t('pin.title')} back>
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

  if (step === 'shown') {
    return (
      <AppShell title={t('pin.title')} back>
        <div className={styles.stack}>
          <p className={styles.text}>{t('pin.text')}</p>
          <Card>
            <div className={styles.rowLabel}>{t('pin.title')}</div>
            <div className={styles.secretValue}>{DEMO.cardPin}</div>
          </Card>
          <div className={styles.footer}>
            <Button variant="secondary" fullWidth onClick={() => setStep('change')}>
              {t('pin.change')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  if (step === 'change') {
    return (
      <AppShell title={t('pin.change')} back>
        <div className={styles.stack}>
          <Input label={t('pin.new')} type="password" inputMode="numeric" autoComplete="off" />
          <div className={styles.footer}>
            <Button fullWidth onClick={() => setStep('shown')}>
              {t('onboarding.pin.action')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={t('pin.title')} back>
      <div className={styles.stack}>
        <h1 className={styles.title}>{t('secrets.ask')}</h1>
        <p className={styles.text}>{t('pin.text')}</p>
        <Input
          label={t('onboarding.pin.field')}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <div className={styles.footer}>
          <Button fullWidth disabled={pin.length < 4} onClick={() => setStep('shown')}>
            {t('pin.show')}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

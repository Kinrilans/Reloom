'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Mail, ShieldAlert } from 'lucide-react'
import { Button, Card, Input, Logo, Toast } from '@/ui'
import { useT } from '@/i18n'
import { useDemoState } from '@/fixtures/demoState'
import { DEMO } from '@/fixtures/scenarios'
import { AppShell } from '../AppShell'
import styles from '../screens.module.css'

/**
 * Привязка аккаунта: А-1 … А-4 (docs/states-user.md).
 *
 * Код восстановления здесь намеренно НЕ оформлен как крипто-мнемоника и
 * не называется сид-фразой: ложная аналогия с кошельком создаёт ощущение
 * криптографической защищённости, которого здесь нет. Платформа
 * кастодиальная, код — обычный секрет (docs/security.md).
 */

type Step = 'code' | 'pin' | 'recovery'

export default function OnboardingPage() {
  const t = useT()
  const router = useRouter()
  const demo = useDemoState()

  const [step, setStep] = useState<Step>('code')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [pin, setPin] = useState('')
  const [repeat, setRepeat] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (demo === 'pin') setStep('pin')
    if (demo === 'recovery') setStep('recovery')
    if (demo === 'invalid') {
      setStep('code')
      setError(t('onboarding.link.invalid'))
    }
  }, [demo, t])

  /* --- А-4. Выдача кода восстановления ------------------------------------ */
  if (step === 'recovery') {
    return (
      <AppShell>
        <div className={styles.stack}>
          <h1 className={styles.title}>{t('onboarding.recovery.title')}</h1>
          <p className={styles.text}>{t('onboarding.recovery.text')}</p>

          <Toast tone="warning" title={t('onboarding.recovery.once')} />

          <Card>
            <p className={styles.address}>{DEMO.recoveryCode}</p>
            <div className={styles.footer}>
              <Button
                variant="secondary"
                fullWidth
                iconStart={copied ? <Check size={16} /> : <Copy size={16} />}
                onClick={() => {
                  void navigator.clipboard?.writeText(DEMO.recoveryCode).catch(() => undefined)
                  setCopied(true)
                }}
              >
                {copied ? t('common.copied') : t('common.copy')}
              </Button>
            </div>
          </Card>

          <div className={styles.footer}>
            <Button fullWidth onClick={() => router.push('/app')}>
              {t('onboarding.recovery.saved')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  /* --- А-3. Задание PIN приложения ---------------------------------------- */
  if (step === 'pin') {
    const mismatch = repeat.length > 0 && pin !== repeat
    return (
      <AppShell>
        <div className={styles.stack}>
          <h1 className={styles.title}>{t('onboarding.pin.title')}</h1>
          {/* Последняя фраза обязательна: иначе человек решит, что задаёт
              PIN для оплаты. */}
          <p className={styles.text}>{t('onboarding.pin.text')}</p>

          <Input
            label={t('onboarding.pin.field')}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <Input
            label={t('onboarding.pin.repeat')}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={repeat}
            error={mismatch ? t('onboarding.pin.mismatch') : undefined}
            onChange={(e) => setRepeat(e.target.value)}
          />

          <div className={styles.footer}>
            <Button
              fullWidth
              disabled={pin.length < 4 || mismatch || repeat.length === 0}
              onClick={() => setStep('recovery')}
            >
              {t('onboarding.pin.action')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  /* --- А-1, А-2. Ввод кода подключения ------------------------------------ */
  return (
    <AppShell>
      <div className={styles.stack}>
        <Logo variant="lockup" tone="duo" height={28} title="Reloom" />
        <h1 className={styles.title}>{t('onboarding.link.title')}</h1>
        <p className={styles.text}>{t('onboarding.link.text')}</p>

        <Input
          label={t('onboarding.link.field')}
          value={code}
          error={error}
          onChange={(e) => {
            setCode(e.target.value)
            setError(undefined)
          }}
        />

        <div className={styles.footer}>
          <Button fullWidth disabled={code.length === 0} onClick={() => setStep('pin')}>
            {t('onboarding.link.action')}
          </Button>
          {/* Telegram есть не у всех, и открыть приложение иногда нужно
              с компьютера. Вход по почте — равноправный способ, а не
              запасной (docs/flows-user.md). */}
          <Button
            variant="secondary"
            fullWidth
            iconStart={<Mail size={16} />}
            onClick={() => router.push('/app/login')}
          >
            {t('login.title')}
          </Button>
          <Button
            variant="ghost"
            fullWidth
            iconStart={<ShieldAlert size={16} />}
            onClick={() => router.push('/app/recovery')}
          >
            {t('recovery.title')}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

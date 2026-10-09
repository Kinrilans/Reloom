'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, LogIn } from 'lucide-react'
import { Button, Card, Input, Logo, Qr, ThemeToggle, Toast } from '@/ui'
import { useI18n } from '@/i18n'
import { passwordStepAction, signInAction } from './actions'
import styles from './login.module.css'

/**
 * Вход оператора.
 *
 * Публичной регистрации нет: операторы заводятся вручную, поэтому
 * здесь нет ни ссылки «зарегистрироваться», ни самостоятельного
 * восстановления пароля — сброс делает другой оператор.
 *
 * Два шага, и первый доступа не даёт: пароль только проверяется.
 * Сессия появляется после кода второго фактора. У нового оператора
 * фактора ещё нет, и он настраивает его тут же — пустить внутрь
 * «пока настроит» нельзя, потому что «пока» длится месяцами.
 *
 * Пароль остаётся в памяти страницы между шагами и уходит на сервер
 * второй раз вместе с кодом. Это нарочно: иначе между шагами
 * появилось бы промежуточное состояние, которое само по себе
 * является половиной доступа.
 *
 * Секрет второго фактора показывается и кодом, и строкой. Код —
 * основной путь: тридцать два символа набирают в телефоне минуту
 * и обычно с опечаткой. Строка остаётся под ним, потому что код
 * смотрят с экрана ноутбука, и если камера его не берёт, человеку
 * нужен способ закончить настройку, а не начать её заново.
 */
export default function AdminLoginPage() {
  const router = useRouter()
  const { t } = useI18n()

  const [step, setStep] = useState<'password' | 'totp'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submitPassword() {
    setError(null)
    startTransition(async () => {
      const result = await passwordStepAction(email, password)
      if (!result.ok) {
        setError(messageFor(result.error, result.retryAfterSeconds))
        return
      }
      setSetup(
        result.needsSetup && result.secret && result.uri
          ? { secret: result.secret, uri: result.uri }
          : null,
      )
      setStep('totp')
    })
  }

  function submitCode() {
    setError(null)
    startTransition(async () => {
      const result = await signInAction(email, password, code)
      if (!result.ok) {
        setError(messageFor(result.error, result.retryAfterSeconds))
        return
      }
      router.replace('/admin')
    })
  }

  function messageFor(reason: string | undefined, seconds: number | undefined): string {
    if (reason === 'THROTTLED') {
      return t('admin.login.errorThrottled', { seconds: seconds ?? 0 })
    }
    if (reason === 'BAD_CODE') return t('admin.login.errorCode')
    return t('admin.login.errorCredentials')
  }

  return (
    <div className={styles.page}>
      <div className={styles.corner}>
        <ThemeToggle />
      </div>

      <Card className={styles.card}>
        <div className={styles.head}>
          <Logo variant="lockup" tone="current" height={24} title="Reloom" />
          <p className={styles.note}>{t('admin.login.subtitle')}</p>
        </div>

        {error ? <Toast tone="danger" title={error} /> : null}

        {step === 'password' ? (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault()
              submitPassword()
            }}
          >
            <Input
              label={t('admin.login.email')}
              type="email"
              autoComplete="username"
              placeholder="operator@reloom.example"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label={t('admin.login.password')}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button
              type="submit"
              fullWidth
              iconStart={<LogIn size={18} />}
              disabled={email.length === 0 || password.length === 0 || pending}
            >
              {t('admin.login.submit')}
            </Button>
          </form>
        ) : (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault()
              submitCode()
            }}
          >
            {setup ? (
              <>
                <Toast
                  tone="warning"
                  title={t('admin.login.setupTitle')}
                  text={t('admin.login.setupText')}
                />
                <div className={styles.qr}>
                  <Qr value={setup.uri} alt={t('admin.login.setupQrAlt')} size={192} />
                </div>
                <Input
                  label={t('admin.login.setupSecret')}
                  value={setup.secret}
                  readOnly
                  hint={t('admin.login.setupHint')}
                />
              </>
            ) : null}

            <Input
              label={t('admin.login.code')}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              hint={t('admin.login.codeHint')}
              required
            />
            <Button
              type="submit"
              fullWidth
              iconStart={<KeyRound size={18} />}
              disabled={code.length === 0 || pending}
            >
              {t('admin.login.verify')}
            </Button>
            <Button
              variant="ghost"
              fullWidth
              type="button"
              onClick={() => {
                setStep('password')
                setCode('')
                setError(null)
              }}
            >
              {t('admin.login.back')}
            </Button>
          </form>
        )}

        <Toast
          tone="neutral"
          title={t('admin.login.lostTitle')}
          text={t('admin.login.lostText')}
        />
      </Card>
    </div>
  )
}

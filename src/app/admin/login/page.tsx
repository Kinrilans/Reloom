'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, LogIn } from 'lucide-react'
import { Button, Card, Input, Logo, ThemeToggle, Toast } from '@/ui'
import { useI18n } from '@/i18n'
import styles from './login.module.css'

/**
 * Вход оператора.
 *
 * Публичной регистрации нет: операторы заводятся вручную, поэтому здесь
 * нет ни ссылки «зарегистрироваться», ни восстановления пароля своими
 * силами — сброс делает другой оператор.
 *
 * Два шага: пароль и TOTP (docs/flows-admin.md). Второй фактор здесь не
 * необязательная галочка — админка двигает чужие деньги.
 *
 * В прототипе проверки нет: подойдут любые значения, ни одно из них
 * никуда не отправляется и нигде не сохраняется. Настоящая проверка,
 * ограничение числа попыток и сессии появятся на этапе разработки.
 */
export default function AdminLoginPage() {
  const router = useRouter()
  const { t } = useI18n()

  const [step, setStep] = useState<'password' | 'totp'>('password')
  const [email, setEmail] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')

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

        {step === 'password' ? (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault()
              setStep('totp')
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
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              required
            />
            <Button
              type="submit"
              fullWidth
              iconStart={<LogIn size={18} />}
              disabled={email.length === 0 || secret.length === 0}
            >
              {t('admin.login.submit')}
            </Button>
          </form>
        ) : (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault()
              router.push('/admin')
            }}
          >
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
              disabled={code.length === 0}
            >
              {t('admin.login.verify')}
            </Button>
            <Button variant="ghost" fullWidth onClick={() => setStep('password')}>
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

      <p className={styles.proto}>{t('admin.login.proto')}</p>
    </div>
  )
}

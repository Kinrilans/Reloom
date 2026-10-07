'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Mail, Send } from 'lucide-react'
import { Button, Input, Logo, Toast } from '@/ui'
import { useT } from '@/i18n'
import { useDemoState } from '@/fixtures/demoState'
import { DEMO } from '@/fixtures/scenarios'
import { AppShell } from '../AppShell'
import screens from '../screens.module.css'
import styles from './login.module.css'

/**
 * Вход.
 *
 * Три способа, и они не равны по механике, хотя равны по правам.
 *
 * **Telegram.** Кнопка открывает бота сразу, без промежуточного экрана:
 * объяснять там нечего, а лишний шаг на самом входе — это лишний отказ.
 * Больше из браузера мы ничего и не можем: сайт не знает, есть ли
 * у человека Telegram, и проверить это не в состоянии — привязку делает
 * бот. А если приложение открыто как Mini App изнутри Telegram,
 * проверять нечего: Telegram сам сообщает, кто пришёл, и аккаунт
 * привязывается к его `telegram_user_id`.
 *
 * **Почта.** Для тех, у кого Telegram нет, и для работы с компьютера:
 * почта, пароль с повтором, затем код из письма. Почта подтверждается
 * обязательно — на неё уходит восстановление доступа, и непроверенный
 * адрес означает, что восстановление уйдёт неизвестно кому.
 *
 * **Ключ доступа.** Для тех, кого завёл оператор в админке: одноразовый
 * код привязки из `/app/onboarding`. Случай редкий, поэтому третьей
 * кнопкой, а не отдельным разделом.
 *
 * Настоящей проверки здесь нет и быть не может: в прототипе нет ни входа,
 * ни базы (docs/prototype.md). Пароль не проверяется, код не сверяется.
 */

type Step = 'start' | 'webapp' | 'email' | 'password' | 'code'

/**
 * Шаг мастера: знак, заголовок, поля, кнопки внизу.
 *
 * Объявлен здесь, а не внутри страницы, и это не вкусовщина: компонент,
 * созданный в теле другого компонента, на каждой отрисовке оказывается
 * новым типом. React сносит поддерево и ставит его заново — поле ввода
 * теряет фокус после первого же символа.
 */
function WizardStep({
  title,
  text,
  children,
}: {
  title: string
  text?: string
  children: ReactNode
}) {
  return (
    <AppShell>
      <div className={screens.stack}>
        <Logo variant="lockup" tone="duo" height={24} title="Reloom" />
        <h1 className={screens.title}>{title}</h1>
        {text ? <p className={screens.text}>{text}</p> : null}
        {children}
      </div>
    </AppShell>
  )
}

export default function LoginPage() {
  const t = useT()
  const router = useRouter()
  const demo = useDemoState()

  const [step, setStep] = useState<Step>('start')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | undefined>()

  /* Внутри Telegram экран выбора не нужен: кто пришёл, уже известно.
     Проверяем после монтирования — на сервере окна нет. */
  useEffect(() => {
    if (window.Telegram?.WebApp) setStep('webapp')
  }, [])

  useEffect(() => {
    if (demo === 'webapp') setStep('webapp')
    if (demo === 'email') setStep('email')
    if (demo === 'password') setStep('password')
    if (demo === 'code') setStep('code')
    if (demo === 'wrong') {
      setStep('code')
      setError(t('login.confirm.wrong'))
    }
  }, [demo, t])

  /* --- Вход изнутри Telegram ---------------------------------------------- */
  if (step === 'webapp') {
    return (
      <WizardStep title={t('login.webapp.title')} text={t('login.webapp.text')}>
        <div className={screens.footer}>
          <Button fullWidth onClick={() => router.push('/app')}>
            {t('login.webapp.action')}
          </Button>
        </div>
      </WizardStep>
    )
  }

  /* --- Почта --------------------------------------------------------------- */
  if (step === 'email') {
    return (
      <WizardStep title={t('login.email.title')} text={t('login.email.text')}>
        <Input
          label={t('login.email')}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={DEMO.account.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className={screens.footer}>
          <Button fullWidth disabled={email.length === 0} onClick={() => setStep('password')}>
            {t('login.next')}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setStep('start')}>
            {t('common.back')}
          </Button>
        </div>
      </WizardStep>
    )
  }

  /* --- Пароль -------------------------------------------------------------- */
  if (step === 'password') {
    const mismatch = repeat.length > 0 && password !== repeat
    return (
      <WizardStep title={t('login.password.title')} text={t('login.password.text')}>
        <Input
          label={t('login.password.new')}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label={t('login.password.repeat')}
          type="password"
          autoComplete="new-password"
          value={repeat}
          error={mismatch ? t('login.password.mismatch') : undefined}
          onChange={(e) => setRepeat(e.target.value)}
        />
        <div className={screens.footer}>
          <Button
            fullWidth
            disabled={password.length === 0 || repeat.length === 0 || mismatch}
            onClick={() => setStep('code')}
          >
            {t('login.next')}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setStep('email')}>
            {t('common.back')}
          </Button>
        </div>
      </WizardStep>
    )
  }

  /* --- Код из письма -------------------------------------------------------- */
  if (step === 'code') {
    return (
      <WizardStep
        title={t('login.confirm.title')}
        text={t('login.confirm.text', { email: email || DEMO.account.email })}
      >
        <Input
          label={t('login.confirm.field')}
          value={code}
          numeric
          inputMode="numeric"
          autoComplete="one-time-code"
          error={error}
          hint={t('login.confirm.resend')}
          onChange={(e) => {
            setCode(e.target.value)
            setError(undefined)
          }}
        />
        <div className={screens.footer}>
          <Button fullWidth disabled={code.length === 0} onClick={() => router.push('/app')}>
            {t('login.action')}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setStep('password')}>
            {t('common.back')}
          </Button>
        </div>
      </WizardStep>
    )
  }

  /* --- Выбор способа. Первый экран приложения -------------------------------
     Знак наверху, фирменное свечение в нижней половине, выбор прижат
     к низу: решение принимают большим пальцем, а не глазами в центре
     экрана. Свечение гаснет кверху, чтобы не мешаться со знаком. */
  return (
    <AppShell>
      <div className={styles.screen}>
        <span className={styles.gradient} aria-hidden />

        {/* Знак на экране входа крупнее, чем везде: это единственное
            место, где он работает не пометкой, а представлением. */}
        <div className={styles.head}>
          <Logo variant="lockup" tone="duo" height={52} title="Reloom" />
        </div>

        <div className={styles.foot}>
          <h1 className={styles.title}>{t('login.title')}</h1>
          <p className={styles.text}>{t('login.text')}</p>

          {error ? <Toast tone="danger" title={error} /> : null}

          <div className={styles.buttons}>
            {/* Кнопки лежат на фирменной заливке, поэтому и варианты для
                неё: обычная главная кнопка — тот же фиолетовый градиент,
                на этом фоне её просто не видно.

                Telegram уводит в бота сразу, без промежуточного экрана:
                объяснять там нечего, а лишний шаг на входе — это лишний
                отказ. */}
            <Button
              variant="onBrand"
              fullWidth
              iconStart={<Send size={16} />}
              onClick={() => window.open(DEMO.account.bot.link, '_blank', 'noopener')}
            >
              {t('login.telegram')}
            </Button>
            <Button
              variant="onBrandSoft"
              fullWidth
              iconStart={<Mail size={16} />}
              onClick={() => setStep('email')}
            >
              {t('login.email.action')}
            </Button>
            {/* Ключ доступа — для тех, кого завёл оператор в админке.
                Случай редкий, поэтому третьей ступенью: подпись без
                заливки. */}
            <Button
              variant="onBrandGhost"
              fullWidth
              iconStart={<KeyRound size={16} />}
              onClick={() => router.push('/app/onboarding')}
            >
              {t('login.key')}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

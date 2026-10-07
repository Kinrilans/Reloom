'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  ChevronRight,
  Copy,
  KeyRound,
  LifeBuoy,
  Lock,
  Mail,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { Badge, Button, Card, CardHeader, Input, Modal, QrPlaceholder, Select, Switch } from '@/ui'
import type { SelectOption } from '@/ui'
import { LOCALES, LOCALE_NAMES, formatDate, useI18n } from '@/i18n'
import type { Locale } from '@/i18n'
import { useDemoState } from '@/fixtures/demoState'
import { DEMO } from '@/fixtures/scenarios'
import { AppShell } from '../AppShell'
import styles from '../screens.module.css'

/** Каким способом подключён второй фактор. */
type Method = 'app' | 'email'

/** Открытое окно. null — окна нет. */
type Dialog = 'method' | 'app' | 'email' | 'changeEmail' | 'changePassword'

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n()
  const router = useRouter()
  const demo = useDemoState()

  /* Второй фактор. В прототипе это состояние экрана, а не данные: кода
     никто не сверяет и подключения не происходит (docs/prototype.md). */
  const [method, setMethod] = useState<Method | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)

  /* Почта и пароль входа. Почта обязана быть подтверждённой: на неё
     уходит восстановление доступа, и непроверенный адрес означает, что
     восстановление уйдёт неизвестно кому. Поэтому смена адреса сбрасывает
     отметку, а прежний адрес до ввода кода продолжает работать. */
  const [email, setEmail] = useState(DEMO.account.email)
  const [emailVerified, setEmailVerified] = useState(DEMO.account.emailVerified)
  const [newEmail, setNewEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')

  /* Пароль нужен только вне Telegram. У аккаунта, заведённого из бота,
     его может не быть вовсе — тогда здесь не смена, а задание пароля. */
  const [hasPassword, setHasPassword] = useState(true)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')

  const localeOptions: SelectOption[] = LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))

  function connect(next: Method) {
    setMethod(next)
    setDialog(null)
    setCode('')
  }

  function changeEmail() {
    setEmail(newEmail)
    // Код введён — значит новый адрес подтверждён.
    setEmailVerified(true)
    setNewEmail('')
    setEmailCode('')
    setDialog(null)
  }

  function changePassword() {
    setHasPassword(true)
    setPassword('')
    setRepeat('')
    setDialog(null)
  }

  const passwordMismatch = repeat.length > 0 && password !== repeat

  /* Два состояния, до которых обычным путём не добраться: почта ещё не
     подтверждена и пароль не задан (аккаунт заведён из бота). Показываются
     из каталога состояний, в рабочем интерфейсе этого крючка не видно. */
  useEffect(() => {
    if (demo === 'unverified') setEmailVerified(false)
    if (demo === 'nopassword') setHasPassword(false)
  }, [demo])

  return (
    <AppShell title={t('settings.title')} nav>
      {/* Смена языка применяется сразу ко всему: интерфейсу, уведомлениям,
          истории операций (docs/i18n.md). */}
      <Card>
        <CardHeader title={t('settings.language')} />
        <Select
          options={localeOptions}
          value={locale}
          onChange={(next) => setLocale(next as Locale)}
        />
      </Card>

      {/* Почта и пароль — вход вне Telegram. Стоят вместе: это одна
          связка, и менять их приходят тоже вместе. */}
      <Card>
        {/* Сам адрес — подзаголовком: он здесь главное, а не подпись
            «Почта» второй раз. */}
        <CardHeader
          title={t('settings.email')}
          subtitle={email}
          action={
            emailVerified ? (
              <Badge tone="success">{t('settings.email.verified')}</Badge>
            ) : (
              <Badge tone="warning">{t('settings.email.unverified')}</Badge>
            )
          }
        />
        <div className={styles.stack}>
          <p className={styles.note}>{t('settings.email.text')}</p>
          <Button variant="secondary" fullWidth onClick={() => setDialog('changeEmail')}>
            {t('settings.email.change')}
          </Button>
        </div>
      </Card>

      {/* Второй фактор. Нужен прежде всего тем, кто входит по почте: пароль
          в вебе — слабая защита, и один он доступа к деньгам не даёт.

          Отключение — только через поддержку, и это не лень. Самостоятельное
          отключение сводит защиту к паролю ровно тогда, когда она нужнее
          всего: тот, кто увёл пароль, вторым фактором не владеет. */}
      <Card>
        <CardHeader
          title={t('settings.twofa')}
          subtitle={method ? t('settings.twofa.support') : t('settings.twofa.text')}
          action={
            method ? (
              <Badge tone="success">{t('settings.twofa.connected')}</Badge>
            ) : (
              <Badge tone="neutral">{t('settings.twofa.off')}</Badge>
            )
          }
        />

        {method ? (
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('settings.twofa.method')}</span>
            <span className={styles.rowValue}>
              {method === 'app' ? t('settings.twofa.app') : t('settings.twofa.email')}
            </span>
          </div>
        ) : (
          <Button
            fullWidth
            iconStart={<ShieldCheck size={16} />}
            onClick={() => setDialog('method')}
          >
            {t('settings.twofa.connect')}
          </Button>
        )}
      </Card>

      <Card density="dense">
        <CardHeader title={t('settings.security')} />
        <div className={styles.actions}>
          {/* Пароль стоит строкой рядом со сменой PIN, а не отдельной
              карточкой: это такое же действие над доступом, и собственной
              плашки оно не заслуживает. Отметка «не задан» остаётся —
              у аккаунта из бота пароля может не быть вовсе. */}
          <button
            type="button"
            className={styles.actionRow}
            onClick={() => setDialog('changePassword')}
          >
            <Lock className={styles.actionIcon} size={20} />
            <span className={styles.actionLabel}>
              {hasPassword ? t('settings.password.change') : t('settings.password.create')}
            </span>
            {hasPassword ? null : <Badge tone="warning">{t('settings.password.off')}</Badge>}
            <ChevronRight className={styles.actionIcon} size={18} />
          </button>
          <button
            type="button"
            className={styles.actionRow}
            onClick={() => router.push('/app/onboarding?state=pin')}
          >
            <KeyRound className={styles.actionIcon} size={20} />
            <span className={styles.actionLabel}>{t('settings.pin.change')}</span>
            <ChevronRight className={styles.actionIcon} size={18} />
          </button>
          <button
            type="button"
            className={styles.actionRow}
            onClick={() => router.push('/app/onboarding?state=recovery')}
          >
            <ShieldCheck className={styles.actionIcon} size={20} />
            <span className={styles.actionLabel}>{t('settings.recovery.regenerate')}</span>
            <ChevronRight className={styles.actionIcon} size={18} />
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('settings.sessions')} />
        <div className={styles.rows}>
          {DEMO.sessions.map((session) => (
            <div key={session.id} className={styles.step}>
              <span className={styles.stepMark}>
                <MonitorSmartphone size={12} />
              </span>
              <span className={styles.stepBody}>
                <span className={styles.stepTitle}>{session.title}</span>
                <span className={styles.stepMeta}>
                  {t(
                    session.metaKey,
                    session.metaDate ? { date: formatDate(locale, session.metaDate) } : undefined,
                  )}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={t('settings.notifications')} />
        <div className={styles.stackTight}>
          <Switch label={t('settings.notifications.spend')} defaultChecked />
          <Switch label={t('settings.notifications.refund')} defaultChecked />
          <Switch label={t('settings.notifications.transfer')} />
          {/* 3DS и события безопасности отключению не подлежат. */}
          <Switch
            label={`${t('settings.notifications.security')} — ${t('settings.notifications.locked')}`}
            defaultChecked
            disabled
          />
        </div>
      </Card>

      <Card density="dense">
        <div className={styles.actions}>
          <button type="button" className={styles.actionRow}>
            <LifeBuoy className={styles.actionIcon} size={20} />
            <span className={styles.actionLabel}>{t('common.support')}</span>
            <ChevronRight className={styles.actionIcon} size={18} />
          </button>
        </div>
      </Card>

      {/* --- Смена почты ----------------------------------------------------- */}
      <Modal
        open={dialog === 'changeEmail'}
        onClose={() => setDialog(null)}
        title={t('settings.email.change')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={newEmail.length === 0 || emailCode.length === 0}
              onClick={changeEmail}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <Input
            label={t('settings.email.new')}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <p className={styles.note}>{t('settings.email.confirmText')}</p>
          <Input
            label={t('settings.email.code')}
            value={emailCode}
            numeric
            inputMode="numeric"
            autoComplete="one-time-code"
            onChange={(e) => setEmailCode(e.target.value)}
          />
        </div>
      </Modal>

      {/* --- Смена пароля ----------------------------------------------------- */}
      <Modal
        open={dialog === 'changePassword'}
        onClose={() => setDialog(null)}
        title={hasPassword ? t('settings.password.change') : t('settings.password.create')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={password.length === 0 || repeat.length === 0 || passwordMismatch}
              onClick={changePassword}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          {/* Текущий пароль спрашиваем только если он есть: у аккаунта
              из бота его не было никогда. */}
          {hasPassword ? (
            <Input
              label={t('settings.password.current')}
              type="password"
              autoComplete="current-password"
            />
          ) : null}
          <Input
            label={t('settings.password.new')}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label={t('settings.password.repeat')}
            type="password"
            autoComplete="new-password"
            value={repeat}
            error={passwordMismatch ? t('settings.password.mismatch') : undefined}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </div>
      </Modal>

      {/* --- Выбор способа -------------------------------------------------- */}
      <Modal
        open={dialog === 'method'}
        onClose={() => setDialog(null)}
        title={t('settings.twofa.connect')}
      >
        <div className={styles.actions}>
          <button type="button" className={styles.actionRow} onClick={() => setDialog('app')}>
            <Smartphone className={styles.actionIcon} size={20} />
            <span className={styles.actionLabel}>{t('settings.twofa.app')}</span>
            <ChevronRight className={styles.actionIcon} size={18} />
          </button>
          <button type="button" className={styles.actionRow} onClick={() => setDialog('email')}>
            <Mail className={styles.actionIcon} size={20} />
            <span className={styles.actionLabel}>{t('settings.twofa.email')}</span>
            <ChevronRight className={styles.actionIcon} size={18} />
          </button>
        </div>
        <p className={styles.note}>{t('settings.twofa.support')}</p>
      </Modal>

      {/* --- Приложение-аутентификатор -------------------------------------- */}
      <Modal
        open={dialog === 'app'}
        onClose={() => setDialog(null)}
        title={t('settings.twofa.app')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog('method')}>
              {t('common.back')}
            </Button>
            <Button disabled={code.length === 0} onClick={() => connect('app')}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <p className={styles.text}>{t('settings.twofa.app.text')}</p>

          <div className={styles.qr}>
            <QrPlaceholder value={DEMO.twoFactor.otpauth} />
          </div>

          {/* Ключ строкой обязателен: камеры может не быть, а на том же
              устройстве свой же QR не отсканировать. */}
          <div className={styles.stackTight}>
            <span className={styles.note}>{t('settings.twofa.secret')}</span>
            <p className={styles.address}>{DEMO.twoFactor.secret}</p>
            <Button
              variant="secondary"
              size="sm"
              iconStart={copied ? <Check size={16} /> : <Copy size={16} />}
              onClick={() => {
                void navigator.clipboard?.writeText(DEMO.twoFactor.secret).catch(() => undefined)
                setCopied(true)
              }}
            >
              {copied ? t('common.copied') : t('common.copy')}
            </Button>
          </div>

          <Input
            label={t('settings.twofa.code')}
            value={code}
            numeric
            inputMode="numeric"
            autoComplete="one-time-code"
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
      </Modal>

      {/* --- Код на почту ---------------------------------------------------- */}
      <Modal
        open={dialog === 'email'}
        onClose={() => setDialog(null)}
        title={t('settings.twofa.email')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog('method')}>
              {t('common.back')}
            </Button>
            <Button disabled={code.length === 0} onClick={() => connect('email')}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <p className={styles.text}>
            {t('settings.twofa.email.text', { email: DEMO.account.email })}
          </p>
          <Input
            label={t('settings.twofa.code')}
            value={code}
            numeric
            inputMode="numeric"
            autoComplete="one-time-code"
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
      </Modal>
    </AppShell>
  )
}

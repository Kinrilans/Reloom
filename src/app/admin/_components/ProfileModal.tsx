'use client'

import { useState, useTransition } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { Badge, Button, Card, CardHeader, Input, Modal, Qr, Select, Toast } from '@/ui'
import type { SelectOption } from '@/ui'
import { LOCALES, LOCALE_NAMES, useI18n } from '@/i18n'
import type { Locale } from '@/i18n'
import { useAdmin } from '../_store/AdminStore'
import {
  changePasswordAction,
  confirmTotpAction,
  reconnectTotpAction,
  setLocaleAction,
} from './profileActions'
import styles from '../admin.module.css'

/**
 * Профиль оператора.
 *
 * Открывается по щелчку на имени в боковой панели. Здесь всё, что
 * относится к самому оператору, а не к данным: язык интерфейса, второй
 * фактор, свой пароль.
 *
 * Язык переехал сюда из шапки: он настраивается один раз, а место
 * в шапке занимал постоянно — рядом с компанией, которую переключают
 * по десять раз на дню.
 *
 * Второй фактор здесь всегда подключён: сессия без подтверждённого
 * кода не создаётся вовсе. Поэтому действие тут одно — перепривязать
 * к новому приложению, и старый код при этом перестаёт работать сразу.
 *
 * Секрет показывается строкой, а не QR-кодом: настоящий генератор —
 * это зависимость, а нарисованная заглушка не сканируется, и оператор
 * потратил бы на неё время. Строку аутентификатор принимает вводом.
 */

export interface ProfileModalProps {
  open: boolean
  onClose: () => void
}

export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { locale, setLocale, t } = useI18n()
  const { operator } = useAdmin()
  const [pending, startTransition] = useTransition()

  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null)
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')

  const localeOptions: SelectOption[] = LOCALES.map((item) => ({
    value: item,
    label: LOCALE_NAMES[item],
  }))

  const initials = operator.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

  const mismatch = repeat.length > 0 && next !== repeat
  const mayChangeSecret = current.length > 0 && next.length > 0 && next === repeat

  function close() {
    onClose()
    setSetup(null)
    setCode('')
    setNotice(null)
    setError(null)
    setCurrent('')
    setNext('')
    setRepeat('')
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('admin.profile.title')}
      footer={<Button onClick={close}>{t('admin.profile.close')}</Button>}
    >
      <div className={styles.stack}>
        {notice ? <Toast tone="success" title={notice} onClose={() => setNotice(null)} /> : null}
        {error ? <Toast tone="danger" title={error} /> : null}

        <div className={styles.profileHead}>
          <span className={styles.profileAvatar}>{initials}</span>
          <div className={styles.stackTight}>
            <span className={styles.statusTitle}>{operator.name}</span>
            <span className={styles.company}>{operator.email}</span>
            <span className={styles.company}>
              {operator.isSuperAdmin ? t('admin.profile.superAdmin') : t('admin.profile.operator')}
            </span>
          </div>
        </div>

        <Select
          label={t('admin.profile.language')}
          options={localeOptions}
          value={locale}
          onChange={(value) => {
            setLocale(value as Locale)
            startTransition(async () => {
              // Язык запоминается у оператора, а не только в этой
              // вкладке: иначе на другом компьютере он снова чужой.
              await setLocaleAction(value)
            })
          }}
          hint={t('admin.profile.languageHint')}
        />

        {/* --- Второй фактор ---------------------------------------------- */}
        <Card density="dense" tone="nested">
          <CardHeader
            title={t('admin.profile.twoFactor')}
            action={
              <Badge tone="success" icon={<ShieldCheck size={12} />} dot={false}>
                {t('admin.profile.connected')}
              </Badge>
            }
          />

          {setup ? (
            <div className={styles.stack}>
              <Toast
                tone="warning"
                title={t('admin.profile.reconnectWarnTitle')}
                text={t('admin.profile.reconnectWarnText')}
              />
              <div className={styles.qr}>
                <Qr value={setup.uri} alt={t('admin.profile.qrAlt')} size={168} />
              </div>
              <p className={styles.mono}>{setup.secret}</p>
              <p className={styles.kpiHint}>{t('admin.profile.scanHint')}</p>
              <Input
                label={t('admin.profile.code')}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div className={styles.inlineActions}>
                <Button
                  size="sm"
                  disabled={code.length === 0 || pending}
                  onClick={() => {
                    setError(null)
                    startTransition(async () => {
                      const result = await confirmTotpAction(code)
                      if (!result.ok) {
                        setError(t('admin.profile.badCode'))
                        return
                      }
                      setSetup(null)
                      setCode('')
                      setNotice(t('admin.profile.enabledNotice'))
                    })
                  }}
                >
                  {t('admin.profile.confirm')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setSetup(null)}>
                  {t('admin.profile.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className={styles.muted}>{t('admin.profile.enabledText')}</p>
              <div className={styles.kpiRows}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  iconStart={<KeyRound size={16} />}
                  onClick={() => {
                    setError(null)
                    startTransition(async () => {
                      const result = await reconnectTotpAction()
                      if (!result.ok) {
                        setError(result.error)
                        return
                      }
                      setSetup({ secret: result.secret, uri: result.uri })
                    })
                  }}
                >
                  {t('admin.profile.connectAgain')}
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* --- Пароль ------------------------------------------------------ */}
        <Card density="dense" tone="nested">
          <CardHeader title={t('admin.profile.password')} />
          <div className={styles.stack}>
            <Input
              label={t('admin.profile.current')}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <Input
              label={t('admin.profile.new')}
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              hint={t('admin.profile.newHint')}
            />
            <Input
              label={t('admin.profile.repeat')}
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              error={mismatch ? t('admin.profile.mismatch') : undefined}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={!mayChangeSecret || pending}
              onClick={() => {
                setError(null)
                startTransition(async () => {
                  const result = await changePasswordAction({
                    currentPassword: current,
                    nextPassword: next,
                  })
                  if (!result.ok) {
                    setError(result.error)
                    return
                  }
                  setCurrent('')
                  setNext('')
                  setRepeat('')
                  setNotice(t('admin.profile.changed'))
                })
              }}
            >
              {t('admin.profile.change')}
            </Button>
          </div>
        </Card>
      </div>
    </Modal>
  )
}

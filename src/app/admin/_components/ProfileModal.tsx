'use client'

import { useState } from 'react'
import { KeyRound, ShieldCheck, ShieldOff } from 'lucide-react'
import { Badge, Button, Card, CardHeader, Input, Modal, QrPlaceholder, Select, Toast } from '@/ui'
import type { SelectOption } from '@/ui'
import { LOCALES, LOCALE_NAMES, useI18n } from '@/i18n'
import type { Locale } from '@/i18n'
import { useAdmin } from '@/fixtures/adminStore'
import styles from '../admin.module.css'

/**
 * Профиль оператора.
 *
 * Открывается по щелчку на имени в боковой панели. Здесь всё, что
 * относится к самому оператору, а не к данным: язык интерфейса, второй
 * фактор, свой пароль.
 *
 * Язык переехал сюда из шапки: он настраивается один раз, а место в
 * шапке занимал постоянно, рядом с компанией — настройкой, которую
 * переключают по десять раз на дню.
 *
 * Секрет для второго фактора и пароли в прототипе ненастоящие и никуда
 * не отправляются.
 */

/** Выдуманный секрет для показа. Настоящий выдаёт сервер при подключении
 *  и показывается ровно один раз. */
const DEMO_SECRET = 'JBSWY3DPEHPK3PXP'

export interface ProfileModalProps {
  open: boolean
  onClose: () => void
}

export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { locale, setLocale, t } = useI18n()
  const { operator, twoFactor, setTwoFactor } = useAdmin()

  const [connecting, setConnecting] = useState(false)
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')

  const localeOptions: SelectOption[] = LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))

  const initials = operator.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

  const mismatch = repeat.length > 0 && next !== repeat
  const mayChangeSecret = current.length > 0 && next.length > 0 && next === repeat

  function close() {
    onClose()
    setConnecting(false)
    setCode('')
    setNotice(null)
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
          onChange={(value) => setLocale(value as Locale)}
          hint={t('admin.profile.languageHint')}
        />

        {/* --- Второй фактор ---------------------------------------------- */}
        <Card density="dense" tone="nested">
          <CardHeader
            title={t('admin.profile.twoFactor')}
            action={
              twoFactor ? (
                <Badge tone="success" icon={<ShieldCheck size={12} />} dot={false}>
                  {t('admin.profile.connected')}
                </Badge>
              ) : (
                <Badge tone="warning" icon={<ShieldOff size={12} />} dot={false}>
                  {t('admin.profile.notConnected')}
                </Badge>
              )
            }
          />

          {connecting ? (
            <div className={styles.stack}>
              <div className={styles.qrPreview}>
                <QrPlaceholder value={DEMO_SECRET} size={120} />
                <p className={styles.mono}>{DEMO_SECRET}</p>
                <p className={styles.kpiHint}>{t('admin.profile.scanHint')}</p>
              </div>
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
                  disabled={code.length === 0}
                  onClick={() => {
                    setTwoFactor(true)
                    setConnecting(false)
                    setCode('')
                    setNotice(t('admin.profile.enabledNotice'))
                  }}
                >
                  {t('admin.profile.confirm')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConnecting(false)}>
                  {t('admin.profile.cancel')}
                </Button>
              </div>
            </div>
          ) : twoFactor ? (
            <p className={styles.muted}>{t('admin.profile.enabledText')}</p>
          ) : (
            <Toast
              tone="warning"
              title={t('admin.profile.warnTitle')}
              text={t('admin.profile.warnText')}
            />
          )}

          {!connecting ? (
            <div className={styles.kpiRows}>
              <Button
                variant="secondary"
                size="sm"
                iconStart={<KeyRound size={16} />}
                onClick={() => setConnecting(true)}
              >
                {twoFactor ? t('admin.profile.connectAgain') : t('admin.profile.connect')}
              </Button>
            </div>
          ) : null}
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
              disabled={!mayChangeSecret}
              onClick={() => {
                setCurrent('')
                setNext('')
                setRepeat('')
                setNotice(t('admin.profile.changed'))
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

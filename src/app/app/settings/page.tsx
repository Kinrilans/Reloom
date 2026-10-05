'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, KeyRound, LifeBuoy, MonitorSmartphone, ShieldCheck } from 'lucide-react'
import { Card, CardHeader, Select, Switch } from '@/ui'
import type { SelectOption } from '@/ui'
import { LOCALES, LOCALE_NAMES, formatDate, useI18n } from '@/i18n'
import type { Locale } from '@/i18n'
import { DEMO } from '@/fixtures/scenarios'
import { AppShell } from '../AppShell'
import styles from '../screens.module.css'

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n()
  const router = useRouter()

  const localeOptions: SelectOption[] = LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))

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

      <Card density="dense">
        <CardHeader title={t('settings.security')} />
        <div className={styles.actions}>
          <button type="button" className={styles.actionRow} onClick={() => router.push('/app/onboarding?state=pin')}>
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
                  {t(session.metaKey, session.metaDate ? { date: formatDate(locale, session.metaDate) } : undefined)}
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
    </AppShell>
  )
}

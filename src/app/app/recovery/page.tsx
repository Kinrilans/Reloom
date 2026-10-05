'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Input, Toast } from '@/ui'
import { useT } from '@/i18n'
import { AppShell } from '../AppShell'
import styles from '../screens.module.css'

/**
 * Восстановление доступа с другого Telegram.
 *
 * Код даёт полный доступ к деньгам с произвольного устройства, в обход
 * Telegram и в обход PIN. Поэтому после перепривязки включается карантин
 * на 24 часа: он и есть основная защита — задержка даёт время заметить
 * и вмешаться (docs/security.md).
 */
export default function RecoveryPage() {
  const t = useT()
  const router = useRouter()
  const [code, setCode] = useState('')
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <AppShell>
        <div className={styles.stack}>
          <h1 className={styles.title}>{t('recovery.done.title')}</h1>
          {/* Перепривязка НЕ переносит второй фактор: PIN задаётся заново,
              прежний код восстановления недействителен. */}
          <p className={styles.text}>{t('recovery.done.text')}</p>
          <Toast tone="warning" title={t('recovery.quarantine')} />
          <div className={styles.footer}>
            <Button fullWidth onClick={() => router.push('/app/onboarding?state=pin')}>
              {t('common.continue')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell back>
      <div className={styles.stack}>
        <h1 className={styles.title}>{t('recovery.title')}</h1>
        <p className={styles.text}>{t('recovery.text')}</p>

        <Card>
          <Input
            label={t('recovery.field')}
            placeholder="RLM-••••-••••-••••-••••"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Card>

        <div className={styles.footer}>
          <Button fullWidth disabled={code.length === 0} onClick={() => setDone(true)}>
            {t('recovery.action')}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

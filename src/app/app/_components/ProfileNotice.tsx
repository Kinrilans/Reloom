'use client'

import { Toast } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { useStore } from '@/fixtures/store'

/**
 * Состояния профиля А-5 … А-8 (docs/states-user.md).
 *
 * Прогресс-бара здесь намеренно нет: проверку делает человек вручную,
 * и мы не знаем, на каком она этапе. Рисовать индикатор, имитирующий
 * автоматику, — врать про сроки.
 */
export function ProfileNotice() {
  const { t, locale } = useI18n()
  const { scenario } = useStore()

  if (scenario.profileStatus === 'PENDING') {
    return <Toast tone="neutral" title={t('profile.pending.title')} text={t('profile.pending.text')} />
  }

  if (scenario.profileStatus === 'STUCK') {
    return <Toast tone="warning" title={t('profile.stuck.title')} text={t('profile.stuck.text')} />
  }

  if (scenario.profileStatus === 'BLOCKED') {
    // Причину блокировки не показываем: она написана оператором для
    // внутреннего разбора, не для пользователя.
    return <Toast tone="danger" title={t('profile.blocked.title')} text={t('profile.blocked.text')} />
  }

  if (scenario.quarantineUntil) {
    // Вторая фраза важнее первой: это единственный момент, когда настоящий
    // владелец может среагировать на угон.
    return (
      <Toast
        tone="warning"
        title={t('profile.quarantine.title')}
        text={t('profile.quarantine.text', {
          until: formatDateTime(locale, scenario.quarantineUntil),
        })}
      />
    )
  }

  return null
}

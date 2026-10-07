'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BellOff, Check, Copy, CreditCard, ShieldCheck, Wallet } from 'lucide-react'
import { Button, Card, EmptyState } from '@/ui'
import { formatDate, formatTime, useI18n } from '@/i18n'
import { NOTIFICATIONS } from '@/fixtures/scenarios'
import type { AppNotification, NotificationKind } from '@/fixtures/types'
import { AppShell } from '../AppShell'
import styles from './notifications.module.css'

/**
 * Лента уведомлений — то же, что приходит в бот.
 *
 * Сделана перепиской, а не списком карточек: это ровно тот вид, в котором
 * человек привык получать эти сообщения, и ровно то, что он увидит, если
 * откроет бот. Два разных вида одного и того же потока пришлось бы сверять
 * глазами.
 *
 * 3DS-код дублируется сюда специально. Он приходит в бот приоритетной
 * очередью (docs/flows-user.md), но если человек работает в браузере, а
 * Telegram у него нет вовсе — взять код больше негде.
 *
 * Тексты собираются из кода и параметров при показе: смена языка
 * перечитывает всю ленту (CLAUDE.md, правило 3e).
 */

const ICONS: Record<NotificationKind, typeof Wallet> = {
  challenge: ShieldCheck,
  money: Wallet,
  card: CreditCard,
  security: ShieldCheck,
}

export default function NotificationsPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [copied, setCopied] = useState<string | null>(null)

  function copy(id: string, code: string) {
    void navigator.clipboard?.writeText(code).catch(() => undefined)
    setCopied(id)
    window.setTimeout(() => setCopied(null), 1500)
  }

  /** Подпись события. Причина отказа — тоже код, и тоже переводится. */
  function textOf(item: AppNotification): string {
    const params = { ...item.params }
    if (item.reasonCode) params.reason = t(`decline.${item.reasonCode}`)
    return t(`notify.${item.code}.text`, params)
  }

  // Разрез по дням — по самой строке даты, без арифметики над временем.
  let previousDay = ''

  return (
    <AppShell title={t('notifications.title')} nav>
      {NOTIFICATIONS.length === 0 ? (
        <Card density="flush">
          <EmptyState
            icon={<BellOff size={24} />}
            title={t('notifications.empty.title')}
            text={t('notifications.empty.text')}
          />
        </Card>
      ) : null}

      <div className={styles.feed}>
        {NOTIFICATIONS.map((item) => {
          const day = item.at.slice(0, 10)
          const newDay = day !== previousDay
          previousDay = day
          const Icon = ICONS[item.kind]

          return (
            <div className={styles.group} key={item.id}>
              {newDay ? <div className={styles.day}>{formatDate(locale, item.at)}</div> : null}

              <article
                className={[styles.bubble, item.unread ? styles.unread : null]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className={styles.icon}>
                  <Icon size={16} />
                </span>

                <div className={styles.body}>
                  <h2 className={styles.title}>{t(`notify.${item.code}.title`)}</h2>
                  <p className={styles.text}>{textOf(item)}</p>

                  {/* Код вынесен из абзаца: его переписывают в чужое окно
                      оплаты, и искать его в тексте некогда. */}
                  {item.challengeCode ? (
                    <div className={styles.code}>
                      <span className={styles.codeValue}>{item.challengeCode}</span>
                      {/* Без подписи: значок копирования однозначен, а
                          подпись занимает место рядом с самим кодом. */}
                      <Button
                        variant="secondary"
                        size="sm"
                        iconOnly
                        aria-label={copied === item.id ? t('common.copied') : t('common.copy')}
                        iconStart={copied === item.id ? <Check size={18} /> : <Copy size={18} />}
                        onClick={() => copy(item.id, item.challengeCode!)}
                      />
                    </div>
                  ) : null}

                  {/* Уведомление с действием. Их мало и нарочно: лента
                      не место для кнопок, но возврат средств искать
                      по экранам человек не станет. */}
                  {item.actionCode === 'refund' ? (
                    <div className={styles.action}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => router.push('/app/refund')}
                      >
                        {t('notify.aml.failed.action')}
                      </Button>
                    </div>
                  ) : null}

                  <div className={styles.meta}>
                    <time dateTime={item.at}>{formatTime(locale, item.at)}</time>
                    {item.unread ? <span className={styles.unreadMark}>{t('notifications.new')}</span> : null}
                  </div>
                </div>
              </article>
            </div>
          )
        })}
      </div>
    </AppShell>
  )
}

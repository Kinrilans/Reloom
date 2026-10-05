'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { Card, CardHeader, Toast } from '@/ui'
import { useStore } from '@/fixtures/store'
import { AppShell } from '../AppShell'
import styles from '../screens.module.css'

/**
 * Каталог состояний клиентской части.
 *
 * Служебный экран: в продукт он не переносится и из интерфейса на него
 * нет ни одной ссылки. Нужен для приёмки П1 — проверить, что каждое
 * состояние из docs/states-user.md действительно собрано, а не осталось
 * на бумаге. Редкие состояния застают человека врасплох, поэтому рисуются
 * обязательно, даже если встречаются раз в год.
 *
 * Полноценная панель переключения с заготовленными персонажами, которая
 * открывает любое состояние в два клика, — этап П3 (docs/prototype.md).
 */

interface StateLink {
  code: string
  title: string
  /** Сценарий демо-данных, если состояние зависит от положения дел. */
  scenario?: string
  href: string
}

const GROUPS: { title: string; items: StateLink[] }[] = [
  {
    title: 'А. Аккаунт и доступ',
    items: [
      { code: 'А-1', title: 'Аккаунт не привязан', href: '/app/onboarding' },
      { code: 'А-2', title: 'Код привязки не подошёл', href: '/app/onboarding?state=invalid' },
      { code: 'А-3', title: 'Задание PIN приложения', href: '/app/onboarding?state=pin' },
      { code: 'А-4', title: 'Выдача кода восстановления', href: '/app/onboarding?state=recovery' },
      { code: 'А-5', title: 'Профиль на проверке', scenario: 'profilePending', href: '/app' },
      { code: 'А-6', title: 'Профиль застрял', scenario: 'profileStuck', href: '/app' },
      { code: 'А-7', title: 'Пользователь заблокирован', scenario: 'blocked', href: '/app' },
      { code: 'А-8', title: 'Карантин после смены Telegram', scenario: 'quarantine', href: '/app' },
      { code: '—', title: 'Восстановление с другого Telegram', href: '/app/recovery' },
    ],
  },
  {
    title: 'Б. Деньги и карты',
    items: [
      { code: 'Б-1', title: 'Нет карт, баланс нулевой', scenario: 'empty', href: '/app' },
      { code: 'Б-2', title: 'Нет карт, баланс есть', scenario: 'funded', href: '/app' },
      { code: 'Б-3', title: 'Достигнут предел в две карты', scenario: 'default', href: '/app' },
      { code: 'Б-4', title: 'Выпуск карты выполняется', scenario: 'oneCard', href: '/app/issue' },
      { code: 'Б-5', title: 'Выпуск карты не удался', href: '/app/issue?state=failed' },
      { code: 'Б-6', title: 'Перевод выполняется', href: '/app/transfer?state=progress' },
      { code: 'Б-7', title: 'Перевод не завершился', href: '/app/transfer?state=stuck' },
      { code: 'Б-8', title: 'Баланс ушёл в минус', scenario: 'negative', href: '/app' },
      {
        code: 'Б-9',
        title: 'Карта заморожена пользователем',
        scenario: 'frozenByUser',
        href: '/app/card/card-primary',
      },
      {
        code: 'Б-10',
        title: 'Карта заморожена из-за минуса',
        scenario: 'negative',
        href: '/app/card/card-primary',
      },
      {
        code: 'Б-11',
        title: 'Карта закрывается, удержание',
        scenario: 'closing',
        href: '/app/card/card-primary',
      },
      {
        code: 'Б-12',
        title: 'При закрытии не выпустилась новая карта',
        href: '/app/card/card-primary/close?state=failed',
      },
      { code: 'Б-13', title: 'Карта закрыта', scenario: 'closed', href: '/app/card/card-primary' },
      { code: 'Б-14', title: 'Заявка на пополнение на проверке', href: '/app/topup?state=pending' },
      { code: 'Б-15', title: 'Заявка отклонена', href: '/app/topup?state=rejected' },
      { code: 'Б-16', title: 'Сумма меньше минимальной', href: '/app/topup?state=belowMin' },
    ],
  },
  {
    title: 'В. Внешние ограничения',
    items: [
      { code: 'В-1', title: 'Пул компании исчерпан', scenario: 'poolExhausted', href: '/app' },
      {
        code: 'В-2',
        title: 'Исчерпан бюджет просмотров реквизитов',
        href: '/app/card/card-primary/secrets?state=throttled',
      },
      { code: 'В-3', title: 'Сервис недоступен', scenario: 'offline', href: '/app' },
      { code: 'В-4', title: '3DS-код получен', href: '/app/challenge' },
      { code: 'В-5', title: '3DS-код пришёл просроченным', href: '/app/challenge?state=expired' },
    ],
  },
  {
    title: 'Г. Мультивалютные операции',
    items: [
      {
        code: 'Г-1',
        title: 'Холд и списание разошлись по курсу',
        scenario: 'default',
        href: '/app/history/op-3',
      },
      {
        code: '—',
        title: 'Мерчант дописал сумму (чаевые)',
        scenario: 'default',
        href: '/app/history/op-4',
      },
      {
        code: 'Г-2',
        title: 'Возврат пришёл меньше покупки',
        scenario: 'default',
        href: '/app/history/op-5',
      },
      {
        code: 'Г-3',
        title: 'Операция в чужой валюте в списке',
        scenario: 'default',
        href: '/app/history',
      },
    ],
  },
]

export default function StatesPage() {
  const router = useRouter()
  const { setScenario } = useStore()

  function open(item: StateLink) {
    if (item.scenario) setScenario(item.scenario)
    router.push(item.href)
  }

  return (
    <AppShell title="Состояния">
      <Toast
        tone="neutral"
        title="Служебный экран"
        text="Каталог состояний из docs/states-user.md. В продукт не переносится, ссылок на него в интерфейсе нет."
      />

      {GROUPS.map((group) => (
        <Card key={group.title} density="dense">
          <CardHeader title={group.title} />
          <div className={styles.actions}>
            {group.items.map((item) => (
              <button
                key={`${item.code}-${item.title}`}
                type="button"
                className={styles.actionRow}
                onClick={() => open(item)}
              >
                <span className={styles.rowLabel}>{item.code}</span>
                <span className={styles.actionLabel}>{item.title}</span>
                <ChevronRight className={styles.actionIcon} size={18} />
              </button>
            ))}
          </div>
        </Card>
      ))}
    </AppShell>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { Card, CardHeader, Toast } from '@/ui'
import { useStore } from '@/fixtures/store'
import { USER_STATES } from '@/demo/personas'
import type { DemoState } from '@/demo/personas'
import { AppShell } from '../AppShell'
import styles from '../screens.module.css'

/**
 * Каталог состояний клиентской части.
 *
 * Служебный экран: в продукт он не переносится и из интерфейса на него
 * нет ни одной ссылки. Нужен для приёмки — проверить, что каждое
 * состояние из docs/states-user.md действительно собрано, а не осталось
 * на бумаге. Редкие состояния застают человека врасплох, поэтому рисуются
 * обязательно, даже если встречаются раз в год.
 *
 * Список берётся из того же файла, что и панель показа (П3): два списка
 * одного и того же неизбежно разъедутся, и показывать будут по одному,
 * а проверять по другому.
 */
export default function StatesPage() {
  const router = useRouter()
  const { setScenario } = useStore()

  function open(item: DemoState) {
    if (item.scenario) setScenario(item.scenario)
    router.push(item.href)
  }

  return (
    <AppShell title="Состояния">
      <Toast
        tone="neutral"
        title="Служебный экран"
        text="Каталог состояний из docs/states-user.md. В продукт не переносится, ссылок на него в интерфейсе нет. То же самое, вместе с админкой и персонажами, открывает панель показа: Ctrl/Cmd + Shift + D."
      />

      {USER_STATES.map((group) => (
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

'use client'

import { Badge, Button, Drawer } from '@/ui'
import { DEMO_GROUPS } from './personas'
import type { DemoState } from './personas'
import styles from './DemoPanel.module.css'

/**
 * Панель переключения состояний.
 *
 * Показ любого состояния — два действия: вызвать панель и выбрать строку.
 * Поэтому здесь нет ни вкладок, ни фильтров, ни поиска: всё лежит одним
 * списком, персонажи сверху.
 *
 * Панель — инструмент прототипа и в продукт не переносится.
 */
export interface DemoPanelProps {
  open: boolean
  onClose: () => void
  /** Какая поверхность открыта сейчас: её строки применяются без перехода. */
  surface: 'app' | 'admin'
  /** Что сейчас показано, чтобы строку было видно в списке. */
  activeScenario?: string
  activeCompany?: string
  onPick: (state: DemoState) => void
}

export function DemoPanel({
  open,
  onClose,
  surface,
  activeScenario,
  activeCompany,
  onPick,
}: DemoPanelProps) {
  function isActive(item: DemoState): boolean {
    if (item.surface !== surface) return false
    if (item.scenario) return item.scenario === activeScenario
    if (item.company) return item.company === activeCompany
    return false
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Состояния"
      subtitle="Панель показа. В продукте её не будет."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
      }
    >
      {DEMO_GROUPS.map((group) => (
        <section className={styles.group} key={group.title}>
          <h3 className={styles.groupTitle}>{group.title}</h3>
          {group.note ? <p className={styles.groupNote}>{group.note}</p> : null}

          <div className={styles.list}>
            {group.items.map((item) => (
              <button
                type="button"
                className={[styles.item, isActive(item) ? styles.itemActive : null]
                  .filter(Boolean)
                  .join(' ')}
                key={`${item.code}-${item.title}`}
                onClick={() => onPick(item)}
              >
                <span className={styles.code}>{item.code}</span>
                <span className={styles.title}>{item.title}</span>
                <Badge tone={item.surface === 'admin' ? 'brand' : 'neutral'}>
                  {item.surface === 'admin' ? 'Админка' : 'Приложение'}
                </Badge>
              </button>
            ))}
          </div>
        </section>
      ))}

      <p className={styles.hint}>
        Вызов: Ctrl/Cmd + Shift + D. На телефоне — три быстрых нажатия на логотип.
      </p>
    </Drawer>
  )
}

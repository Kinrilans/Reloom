'use client'

import { Button, Drawer, Input, Select } from '@/ui'
import type { SelectOption } from '@/ui'
import { useT } from '@/i18n'
import styles from '../../screens.module.css'

/**
 * Отбор в истории операций — шторкой снизу, как «Активные транзакции».
 *
 * Отбор применяется сразу, по мере выбора: кнопки «применить» нет.
 * Экран под шторкой открыт, и список под ней уже перестроен — лишний
 * шаг здесь только отодвигает результат. Нижняя кнопка просто закрывает
 * шторку, а сбросить всё можно, не закрывая её.
 */
export interface HistoryFilter {
  cardId: string
  from: string
  to: string
}

export function FilterSheet({
  open,
  onClose,
  value,
  onChange,
  onClear,
  cards,
  found,
}: {
  open: boolean
  onClose: () => void
  value: HistoryFilter
  onChange: (next: HistoryFilter) => void
  onClear: () => void
  cards: { id: string; last4: string }[]
  /** Сколько операций попало под отбор прямо сейчас. */
  found: number
}) {
  const t = useT()

  const active = value.cardId !== 'all' || value.from !== '' || value.to !== ''

  /* Отменённые карты из списка не убираются: операции по закрытой карте
     никуда не делись, и смотреть их будут именно через этот отбор. */
  const cardOptions: SelectOption[] = [
    { value: 'all', label: t('history.filter.allCards') },
    ...cards.map((c) => ({ value: c.id, label: `•••• ${c.last4}` })),
  ]

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      title={t('history.filter.title')}
      subtitle={t('history.filter.found', { count: found })}
      footer={
        <div className={styles.sheetFooter}>
          {active ? (
            <Button variant="secondary" fullWidth onClick={onClear}>
              {t('history.filter.clear')}
            </Button>
          ) : null}
          <Button fullWidth onClick={onClose}>
            {t('history.filter.done')}
          </Button>
        </div>
      }
    >
      <div className={styles.filters}>
        <Select
          label={t('history.filter.card')}
          options={cardOptions}
          value={value.cardId}
          onChange={(v) => onChange({ ...value, cardId: v })}
        />
        <div className={styles.filterPair}>
          <Input
            type="date"
            label={t('history.filter.from')}
            value={value.from}
            max={value.to === '' ? undefined : value.to}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
          />
          <Input
            type="date"
            label={t('history.filter.to')}
            value={value.to}
            min={value.from === '' ? undefined : value.from}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
          />
        </div>
      </div>
    </Drawer>
  )
}

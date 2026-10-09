'use client'

import { useState } from 'react'
import { Receipt, SearchX, SlidersHorizontal } from 'lucide-react'
import { Badge, Button, Card, EmptyState, List } from '@/ui'
import { useT } from '@/i18n'
import { useStore } from '@/fixtures/store'
import { AppShell } from '../AppShell'
import { OperationRow } from '../_components/OperationRow'
import { FilterSheet } from './_components/FilterSheet'
import type { HistoryFilter } from './_components/FilterSheet'
import styles from '../screens.module.css'

const PAGE = 6

const EMPTY: HistoryFilter = { cardId: 'all', from: '', to: '' }

/** Отбор идёт по тем суткам, которые человек видит в строке операции,
 *  то есть по его часовому поясу, а не по UTC. Иначе вечерняя покупка
 *  выпадает из фильтра «сегодня» и выглядит пропавшей.
 *
 *  Вызывается только когда дата в отборе задана. До этого отбор пустой,
 *  разметка сервера и браузера совпадают, и разъехаться им не на чем:
 *  часовой пояс сервера к этому моменту ни на что не влияет
 *  (docs/i18n.md про даты до гидратации). */
function localDay(iso: string): string {
  const d = new Date(iso)
  const month = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export default function HistoryPage() {
  const t = useT()
  const { scenario } = useStore()
  const [shown, setShown] = useState(PAGE)
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY)
  const [sheetOpen, setSheetOpen] = useState(false)

  const operations = scenario.operations
  const byDate = filter.from !== '' || filter.to !== ''

  /* Счётчик на кнопке считает заданные условия, а не найденные строки:
     на кнопке отбора число означает «сколько я ограничил». Сколько
     нашлось — видно в самом списке и в шапке шторки. */
  const activeCount = (filter.cardId !== 'all' ? 1 : 0) + (filter.from !== '' ? 1 : 0) + (filter.to !== '' ? 1 : 0)

  const matching = operations.filter((op) => {
    if (filter.cardId !== 'all' && op.cardId !== filter.cardId) return false
    if (!byDate) return true
    const day = localDay(op.occurredAt)
    if (filter.from !== '' && day < filter.from) return false
    if (filter.to !== '' && day > filter.to) return false
    return true
  })

  const visible = matching.slice(0, shown)
  const hasMore = shown < matching.length

  /* Любая смена отбора возвращает список к первой странице: иначе
     человек, догрузивший три страницы, после смены карты видит хвост
     чужого списка и не понимает, где начало. */
  function change(next: HistoryFilter) {
    setFilter(next)
    setShown(PAGE)
  }

  return (
    <AppShell title={t('history.title')} nav>
      {operations.length === 0 ? (
        <Card density="flush">
          <EmptyState
            icon={<Receipt size={24} />}
            title={t('history.empty.title')}
            text={t('history.empty.text')}
          />
        </Card>
      ) : (
        <>
          <Button
            variant="secondary"
            fullWidth
            iconStart={<SlidersHorizontal size={18} />}
            iconEnd={activeCount > 0 ? <Badge tone="brand">{activeCount}</Badge> : undefined}
            onClick={() => setSheetOpen(true)}
          >
            {t('history.filter.title')}
          </Button>

          {matching.length === 0 ? (
            <Card density="flush">
              <EmptyState
                icon={<SearchX size={24} />}
                title={t('history.nothing.title')}
                text={t('history.nothing.text')}
                action={
                  <Button variant="secondary" size="sm" onClick={() => change(EMPTY)}>
                    {t('history.filter.clear')}
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              <List>
                {visible.map((op) => (
                  <OperationRow key={op.id} operation={op} />
                ))}
              </List>

              {hasMore ? (
                <div className={styles.footer}>
                  <Button variant="secondary" fullWidth onClick={() => setShown((v) => v + PAGE)}>
                    {t('history.more')}
                  </Button>
                </div>
              ) : null}
            </>
          )}

          <FilterSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            value={filter}
            onChange={change}
            onClear={() => change(EMPTY)}
            cards={scenario.cards}
            found={matching.length}
          />
        </>
      )}
    </AppShell>
  )
}

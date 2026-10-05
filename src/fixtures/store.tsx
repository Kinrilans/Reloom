'use client'

/**
 * Состояние прототипа клиентской части.
 *
 * Переход между состояниями — ПОДМЕНА СЦЕНАРИЯ, а не вычисление
 * (docs/prototype.md). Поэтому здесь нет ни одной арифметической операции
 * над деньгами: действие «перевести» не считает новые остатки, оно
 * переключает набор демо-данных, где остатки уже записаны руками.
 *
 * Статусы карт (заморожена, закрывается) меняются точечно: это состояние,
 * а не деньги, и подменять ради него весь сценарий незачем.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_SCENARIO, getScenario } from './scenarios'
import type { Card, FreezeReason, Scenario } from './types'

interface AppStore {
  scenario: Scenario
  /** Прямое переключение сценария — им пользуется каталог состояний. */
  setScenario: (id: string) => void
  /** Карта по идентификатору. */
  card: (id: string) => Card | undefined
  primary: Card | undefined
  /** Активными считаются только не отменённые карты: отменённая слот
   *  не занимает, иначе скомпрометированная карта навсегда съедала бы его. */
  activeCards: Card[]
  canIssue: boolean
  freeze: (cardId: string, reason: FreezeReason) => void
  unfreeze: (cardId: string) => void
  /** Выпуск карты: ведёт в заранее подготовленный сценарий. */
  issueCard: () => void
  /** Перевод между картами: тоже подмена, суммы уже посчитаны. */
  completeTransfer: () => void
  startClosing: (cardId: string) => void
  cancelClosing: (cardId: string) => void
  finishClosing: () => void
}

const StoreContext = createContext<AppStore | null>(null)

/** Куда ведёт выпуск карты из каждого исходного состояния. */
const AFTER_ISSUE: Record<string, string> = {
  funded: 'fundedOneCard',
  profilePending: 'profilePending',
  oneCard: 'default',
  fundedOneCard: 'fundedTwoCards',
}

const AFTER_TRANSFER: Record<string, string> = {
  default: 'afterTransfer',
  afterTransfer: 'default',
  fundedTwoCards: 'fundedAfterTransfer',
  fundedAfterTransfer: 'fundedTwoCards',
}

export function StoreProvider({
  children,
  initialScenario = DEFAULT_SCENARIO,
}: {
  children: ReactNode
  initialScenario?: string
}) {
  const [scenario, setScenarioState] = useState<Scenario>(() => getScenario(initialScenario))

  const setScenario = useCallback((id: string) => {
    setScenarioState(getScenario(id))
  }, [])

  const patchCard = useCallback((cardId: string, patch: Partial<Card>) => {
    setScenarioState((prev) => ({
      ...prev,
      cards: prev.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
    }))
  }, [])

  const value = useMemo<AppStore>(() => {
    const activeCards = scenario.cards.filter((c) => c.status !== 'CANCELED')
    return {
      scenario,
      setScenario,
      card: (id) => scenario.cards.find((c) => c.id === id),
      primary: scenario.cards.find((c) => c.isPrimary && c.status !== 'CANCELED'),
      activeCards,
      // Максимум две активные карты на пользователя. Выпуск также закрыт,
      // пока профиль не одобрен эмитентом.
      canIssue: activeCards.length < 2 && scenario.profileStatus === 'APPROVED',
      freeze: (cardId, reason) => patchCard(cardId, { status: 'FROZEN', freezeReason: reason }),
      unfreeze: (cardId) => patchCard(cardId, { status: 'ACTIVE', freezeReason: undefined }),
      issueCard: () => setScenario(AFTER_ISSUE[scenario.id] ?? 'default'),
      completeTransfer: () => setScenario(AFTER_TRANSFER[scenario.id] ?? 'afterTransfer'),
      startClosing: (cardId) =>
        patchCard(cardId, { status: 'CLOSING', freezeReason: 'CLOSING' }),
      cancelClosing: (cardId) => patchCard(cardId, { status: 'ACTIVE', freezeReason: undefined }),
      finishClosing: () => setScenario('closed'),
    }
  }, [scenario, setScenario, patchCard])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): AppStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore вызван вне StoreProvider')
  return store
}

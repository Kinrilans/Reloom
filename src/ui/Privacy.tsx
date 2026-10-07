'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Скрытие сумм («глазик» в шапке приложения).
 *
 * Живёт в дизайн-системе, а не в приложении, потому что подчиняется ему
 * компонент дизайн-системы — `Amount`. Провайдер необязателен: без него
 * суммы всегда видны, поэтому админка и витрина ничего про него не знают.
 *
 * Состояние запоминается на устройстве: человек прячет суммы в метро или
 * в open space, и просить его об этом на каждом экране бессмысленно.
 * Читается после монтирования — на сервере localStorage нет, и чтение
 * при отрисовке разошлось бы с серверной разметкой.
 */
export interface PrivacyValue {
  hidden: boolean
  toggle: () => void
}

const PrivacyContext = createContext<PrivacyValue | null>(null)

const STORAGE_KEY = 'reloom-amounts-hidden'

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') setHidden(true)
    } catch {
      // приватный режим — выбор просто не запомнится
    }
  }, [])

  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // то же самое: не запомнить не страшно, скрыть — важно
      }
      return next
    })
  }, [])

  const value = useMemo<PrivacyValue>(() => ({ hidden, toggle }), [hidden, toggle])

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
}

/** Прячутся ли суммы прямо сейчас. Без провайдера — нет. */
export function useAmountsHidden(): boolean {
  return useContext(PrivacyContext)?.hidden ?? false
}

/** Переключатель для шапки. Вызывается только там, где провайдер есть. */
export function usePrivacy(): PrivacyValue {
  const value = useContext(PrivacyContext)
  if (!value) throw new Error('usePrivacy вызван вне PrivacyProvider')
  return value
}

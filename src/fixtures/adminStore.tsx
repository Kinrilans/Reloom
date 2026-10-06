'use client'

/**
 * Состояние админки в прототипе.
 *
 * Здесь живут две вещи, которые нужны всем экранам сразу:
 *
 * 1. Выбранная компания. Компаний в холдинге будут десятки, у каждой свой
 *    пул, и разрез по компании присутствует везде с первого дня. «Все
 *    компании» — сводный режим для дашборда и поиска.
 *
 * 2. Права текущего оператора. Интерфейс СКРЫВАЕТ недоступные действия,
 *    а не показывает их неактивными: иначе оператор тратит время на то,
 *    чего не может (docs/flows-admin.md).
 *
 * 3. Состояние второго фактора у текущего оператора. Живёт здесь, а не на
 *    экране, чтобы подключение не сбрасывалось при переходе между
 *    разделами.
 *
 * Денег здесь не считают — только выбирают, что показывать.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CURRENT_OPERATOR, OPERATORS } from './admin'
import type { Operator, Right } from './admin'

export const ALL_COMPANIES = 'all'

interface AdminStore {
  /** Идентификатор компании или ALL_COMPANIES. */
  companyId: string
  setCompanyId: (id: string) => void
  isAllCompanies: boolean
  operator: Operator
  setOperator: (id: string) => void
  can: (right: Right) => boolean
  /** Подключён ли второй фактор у текущего оператора. */
  twoFactor: boolean
  setTwoFactor: (on: boolean) => void
  /** Отбор списка по выбранной компании. Фильтрация, не расчёт. */
  byCompany: <T extends { companyId: string }>(items: T[]) => T[]
}

const AdminContext = createContext<AdminStore | null>(null)

export function AdminStoreProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyId] = useState<string>(ALL_COMPANIES)
  const [operator, setOperatorState] = useState<Operator>(CURRENT_OPERATOR)
  const [twoFactor, setTwoFactor] = useState<boolean>(CURRENT_OPERATOR.twoFactorEnabled)

  // Смена оператора забирает и его состояние второго фактора: иначе
  // «войти как» показало бы чужой профиль с чужой настройкой.
  const setOperator = useCallback((id: string) => {
    const next = OPERATORS.find((o) => o.id === id)
    if (next) {
      setOperatorState(next)
      setTwoFactor(next.twoFactorEnabled)
    }
  }, [])

  const value = useMemo<AdminStore>(() => {
    const isAll = companyId === ALL_COMPANIES
    return {
      companyId,
      setCompanyId,
      isAllCompanies: isAll,
      operator,
      setOperator,
      can: (right) => operator.rights.includes(right),
      twoFactor,
      setTwoFactor,
      byCompany: (items) => (isAll ? items : items.filter((i) => i.companyId === companyId)),
    }
  }, [companyId, operator, setOperator, twoFactor])

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin(): AdminStore {
  const store = useContext(AdminContext)
  if (!store) throw new Error('useAdmin вызван вне AdminStoreProvider')
  return store
}

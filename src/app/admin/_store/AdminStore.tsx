'use client'

/**
 * Состояние админки, общее для всех экранов.
 *
 * В прототипе здесь жили фикстуры. Теперь — настоящий оператор из
 * сессии и настоящий список компаний; значения приходят **пропсами
 * с сервера**, а не читаются из базы клиентом.
 *
 * Выбранная компания хранится в cookie, а не в состоянии React. Это
 * не прихоть: отбор по компании делается **в базе**, а запрос
 * собирает серверный компонент, которому состояние клиента недоступно.
 * Cookie читают и сервер, и клиент, и выбор переживает перезагрузку
 * страницы.
 *
 * Права здесь — для интерфейса: он СКРЫВАЕТ недоступные действия,
 * чтобы оператор не тратил время. Защита же стоит на сервере, в каждом
 * действии: спрятанная кнопка не защищает ни от чего.
 */

import { createContext, useContext, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { selectCompanyAction } from '../actions'
import { ALL_COMPANIES } from '../constants'

export { ALL_COMPANIES }

export interface AdminOperator {
  id: string
  name: string
  email: string
  rights: string[]
  isSuperAdmin: boolean
  twoFactorEnabled: boolean
  locale: string
}

export interface AdminCompany {
  id: string
  name: string
}

interface AdminStore {
  companyId: string
  isAllCompanies: boolean
  setCompanyId: (id: string) => void
  /** Идёт переключение компании: экран перезагружается с сервера. */
  switching: boolean
  companies: AdminCompany[]
  operator: AdminOperator
  can: (right: string) => boolean
  /** Счётчик очереди пополнений для меню. */
  queueSize: number
}

const AdminContext = createContext<AdminStore | null>(null)

export function AdminStoreProvider({
  children,
  operator,
  companies,
  companyId,
  queueSize,
}: {
  children: ReactNode
  operator: AdminOperator
  companies: AdminCompany[]
  companyId: string
  queueSize: number
}) {
  const router = useRouter()
  const [switching, startTransition] = useTransition()

  const value = useMemo<AdminStore>(
    () => ({
      companyId,
      isAllCompanies: companyId === ALL_COMPANIES,
      companies,
      operator,
      queueSize,
      switching,
      can: (right) => operator.isSuperAdmin || operator.rights.includes(right),
      setCompanyId: (id) => {
        startTransition(async () => {
          await selectCompanyAction(id)
          // Серверные компоненты перечитывают данные под новый разрез:
          // без этого на экране остались бы прежние строки.
          router.refresh()
        })
      },
    }),
    [companyId, companies, operator, queueSize, switching, router],
  )

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin(): AdminStore {
  const store = useContext(AdminContext)
  if (!store) throw new Error('useAdmin вызван вне AdminStoreProvider')
  return store
}

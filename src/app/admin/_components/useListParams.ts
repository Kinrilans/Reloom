'use client'

/**
 * Состояние списка — в адресе страницы.
 *
 * Отбор, поиск и номер страницы живут в `?query=`, а не в состоянии
 * React. Причина не в красоте ссылок: списки обязаны работать на
 * тысяче строк, значит отбор идёт **в базе**, а запрос собирает
 * серверный компонент — до состояния клиента ему не добраться.
 *
 * Побочные выгоды того же решения: ссылка на отфильтрованный список
 * открывается у соседа тем же списком, возврат из карточки не теряет
 * место, а переходы с дашборда приходят с уже применённым отбором.
 */

import { useCallback, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export interface ListParams {
  /** Текущее значение параметра. */
  get: (name: string, fallback?: string) => string
  /** Поставить значения; пустая строка убирает параметр. */
  set: (values: Record<string, string>) => void
  /** Номер страницы, с нуля. */
  page: number
  setPage: (page: number) => void
  /** Идёт загрузка новой страницы списка. */
  pending: boolean
}

export function useListParams(): ListParams {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const set = useCallback(
    (values: Record<string, string>) => {
      const next = new URLSearchParams(params.toString())
      for (const [name, value] of Object.entries(values)) {
        if (value === '') next.delete(name)
        else next.set(name, value)
      }
      // Смена отбора всегда возвращает на первую страницу: иначе
      // оператор остаётся на седьмой странице списка, в котором их
      // теперь две, и видит пустой экран.
      if (!('page' in values)) next.delete('page')

      startTransition(() => {
        // `replace`, а не `push`: иначе «назад» уводит по одному
        // нажатию на каждую введённую букву поиска.
        router.replace(`${pathname}?${next.toString()}`, { scroll: false })
      })
    },
    [params, pathname, router],
  )

  const page = Number(params.get('page') ?? '0')

  return {
    get: (name, fallback = '') => params.get(name) ?? fallback,
    set,
    page: Number.isInteger(page) && page >= 0 ? page : 0,
    setPage: (next) => set({ page: String(next) }),
    pending,
  }
}

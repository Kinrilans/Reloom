'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Открытие панели переключения состояний.
 *
 * Панель скрытая: в интерфейсе нет ни одной кнопки, которая бы на неё
 * указывала. Иначе руководство примет инструмент показа за функцию
 * продукта и будет искать его в готовой системе.
 *
 * Два способа вызова:
 *
 * 1. Ctrl/Cmd + Shift + D — основной, как и записано в плане этапа.
 * 2. Три быстрых нажатия на логотип — для телефона, где клавиатуры нет.
 *    Прототип открывают и с телефона (docs/prototype.md, П4), и без этого
 *    на нём до панели не добраться.
 *
 * Сочетание не перехватывается в полях ввода: с модификаторами оно
 * в них ничего не значит, а проверка «не поле ли это» ломалась бы
 * на вложенных редактируемых блоках.
 */

const TAP_WINDOW_MS = 800
const TAPS_TO_OPEN = 3

export function useDemoPanel(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false)
  const taps = useRef<{ count: number; at: number }>({ count: 0, at: 0 })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // code, а не key: на русской раскладке «D» приходит как «в».
      if (e.code === 'KeyD' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }

    function onPointerUp(e: Event) {
      const target = e.target as HTMLElement | null
      if (!target?.closest('[data-demo-trigger]')) return

      const now = Date.now()
      const state = taps.current
      state.count = now - state.at > TAP_WINDOW_MS ? 1 : state.count + 1
      state.at = now

      if (state.count >= TAPS_TO_OPEN) {
        state.count = 0
        setOpen(true)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerup', onPointerUp, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerup', onPointerUp, true)
    }
  }, [])

  return [open, setOpen]
}

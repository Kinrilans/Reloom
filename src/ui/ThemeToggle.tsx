'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Button } from './Button'
import type { ButtonSize } from './Button'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'reloom-theme'

/**
 * Переключатель темы.
 *
 * Тёмная тема основная на обеих поверхностях (docs/brand.md), светлая —
 * вторая полноценная, а не «режим для печати». Выбор запоминается и
 * применяется скриптом в layout до первой отрисовки, иначе страница
 * моргает тёмным при переходе на светлую.
 *
 * Один компонент на витрину и админку: две копии неизбежно разъедутся
 * ключом хранения.
 */
export interface ThemeToggleProps {
  /** С подписью рядом с иконкой. Без неё — только иконка, для плотной шапки. */
  labelled?: boolean
  /** По умолчанию базовый — чтобы в ряду с полями кнопка была их высоты. */
  size?: ButtonSize
  className?: string
}

export function ThemeToggle({ labelled = false, size = 'md', className }: ThemeToggleProps) {
  const { t } = useI18n()
  const [theme, setTheme] = useState<Theme>('dark')

  // Тему читаем после монтирования: на сервере её ещё нет, а разметка
  // не должна разъехаться с тем, что уже применил скрипт в layout.
  useEffect(() => {
    const current = document.documentElement.dataset.theme
    if (current === 'light' || current === 'dark') setTheme(current)
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // приватный режим или заблокированные куки — тема просто не запомнится
    }
  }

  const label = theme === 'dark' ? t('ui.themeLight') : t('ui.themeDark')
  const iconSize = size === 'sm' ? 16 : 20
  const icon = theme === 'dark' ? <Sun size={iconSize} /> : <Moon size={iconSize} />

  return (
    <Button
      variant="secondary"
      size={size}
      onClick={toggle}
      className={className}
      iconStart={icon}
      iconOnly={!labelled}
      aria-label={labelled ? undefined : label}
      title={labelled ? undefined : label}
    >
      {labelled ? label : null}
    </Button>
  )
}

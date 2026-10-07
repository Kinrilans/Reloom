'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Check, ChevronDown, CircleAlert } from 'lucide-react'
import { useI18n } from '@/i18n'
import fieldStyles from './Field.module.css'
import styles from './Select.module.css'

/** Положение списка: замер поля, из которого он раскрывается.

    Фиксированные координаты вместо привязки к полю — чтобы список не
    обрезался прокруткой окна или боковой панели. Величины геометрические,
    в CSS их не выразить, поэтому они уезжают на элемент переменными. */
export interface Placement {
  up: boolean
  style: CSSProperties
}

const GAP = 4
/** Оценка высоты раскрытого списка: шесть строк плюс отступы. Нужна
    только чтобы выбрать сторону раскрытия, поэтому приблизительной
    достаточно — точную высоту до отрисовки всё равно не узнать. */
const MAX_LIST_HEIGHT = 6 * 36 + 16

export function placeBelow(trigger: HTMLElement | null): Placement | null {
  if (!trigger) return null
  const rect = trigger.getBoundingClientRect()
  const roomBelow = window.innerHeight - rect.bottom
  const up = roomBelow < MAX_LIST_HEIGHT && rect.top > roomBelow

  // Пользовательские свойства в типе CSSProperties не описаны, поэтому
  // собираем их как обычную карту строк и приводим один раз.
  const vars: Record<string, string> = {
    '--popup-left': `${rect.left}px`,
    '--popup-width': `${rect.width}px`,
  }
  if (up) {
    vars['--popup-bottom'] = `${window.innerHeight - rect.top + GAP}px`
  } else {
    vars['--popup-top'] = `${rect.bottom + GAP}px`
  }

  return { up, style: vars as CSSProperties }
}

export interface SelectOption {
  value: string
  label: string
  /** Значок перед подписью: монета в выборе сети, флаг в выборе языка.
   *  Подпись он не заменяет — выбор глазами быстрее, но читается текст. */
  icon?: ReactNode
  disabled?: boolean
}

export interface SelectProps {
  options: SelectOption[]
  /** Управляемое значение. Без него компонент хранит выбор сам. */
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  label?: string
  hint?: string
  error?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  name?: string
  className?: string
}

function nextEnabled(options: SelectOption[], from: number, step: 1 | -1): number {
  for (let i = from; i >= 0 && i < options.length; i += step) {
    if (!options[i]?.disabled) return i
  }
  return -1
}

export function Select({
  options,
  value,
  defaultValue,
  onChange,
  label,
  hint,
  error,
  placeholder,
  disabled,
  required,
  name,
  className,
}: SelectProps) {
  const { t } = useI18n()
  const id = useId()
  const triggerId = `${id}-trigger`
  const listId = `${id}-list`

  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [internal, setInternal] = useState<string | undefined>(defaultValue)
  const [activeIndex, setActiveIndex] = useState(-1)

  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typeahead = useRef({ query: '', at: 0 })

  const selected = value ?? internal
  const selectedIndex = options.findIndex((o) => o.value === selected)
  const selectedOption = selectedIndex === -1 ? undefined : options[selectedIndex]

  const commit = useCallback(
    (next: string) => {
      if (value === undefined) setInternal(next)
      onChange?.(next)
    },
    [onChange, value],
  )

  const close = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
  }, [])

  function openList() {
    if (disabled) return
    setActiveIndex(selectedIndex === -1 ? nextEnabled(options, 0, 1) : selectedIndex)
    setOpen(true)
  }

  // Закрытие по клику мимо и по уходу фокуса за пределы контрола.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) close()
    }
    function onFocusIn(e: FocusEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [open, close])

  // Считаем до отрисовки, чтобы список не успел мигнуть не на том месте.
  useLayoutEffect(() => {
    if (!open) return
    setPlacement(placeBelow(triggerRef.current))
  }, [open])

  // Прокрутка уводит поле, а список стоит на фиксированных координатах,
  // поэтому его пересчитываем. Слушаем в фазе перехвата: прокручиваться
  // может любой предок — окно, боковая панель, страница.
  //
  // Именно пересчитываем, а не закрываем: внутри модального окна прокрутка
  // случается сама, хотя бы от подведения поля в зону видимости, и
  // закрытие на каждую выглядело бы как «список не открывается».
  useEffect(() => {
    if (!open) return
    function onMove() {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      // Поле ушло за край окна — держать список не за что.
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        close()
        return
      }
      setPlacement(placeBelow(trigger))
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, close])

  // Держим подсвеченный пункт в зоне видимости при навигации стрелками.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined
    node?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function move(step: 1 | -1) {
    const from = activeIndex === -1 ? (step === 1 ? 0 : options.length - 1) : activeIndex + step
    const next = nextEnabled(options, Math.max(0, Math.min(options.length - 1, from)), step)
    if (next !== -1) setActiveIndex(next)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return

    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openList()
      }
      return
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        close()
        triggerRef.current?.focus()
        break
      case 'ArrowDown':
        e.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(-1)
        break
      case 'Home':
        e.preventDefault()
        setActiveIndex(nextEnabled(options, 0, 1))
        break
      case 'End':
        e.preventDefault()
        setActiveIndex(nextEnabled(options, options.length - 1, -1))
        break
      case 'Enter':
      case ' ': {
        e.preventDefault()
        const option = activeIndex === -1 ? undefined : options[activeIndex]
        if (option && !option.disabled) {
          commit(option.value)
          close()
          triggerRef.current?.focus()
        }
        break
      }
      case 'Tab':
        close()
        break
      default: {
        // Поиск набором первых букв, как в нативном списке.
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return
        const now = Date.now()
        const state = typeahead.current
        state.query = now - state.at > 700 ? e.key : state.query + e.key
        state.at = now
        const q = state.query.toLowerCase()
        const found = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(q))
        if (found !== -1) setActiveIndex(found)
      }
    }
  }

  const message = error ?? hint

  return (
    <div className={[fieldStyles.field, className].filter(Boolean).join(' ')}>
      {label ? (
        <label className={fieldStyles.label} htmlFor={triggerId}>
          {label}
          {required ? (
            <span className={fieldStyles.required} aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}

      <div className={styles.wrap} ref={wrapRef}>
        <button
          type="button"
          id={triggerId}
          ref={triggerRef}
          className={[styles.trigger, error ? styles.invalid : null].filter(Boolean).join(' ')}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          onClick={() => (open ? close() : openList())}
          onKeyDown={onKeyDown}
        >
          {selectedOption?.icon ?? null}
          <span
            className={[styles.value, selectedOption ? null : styles.placeholder]
              .filter(Boolean)
              .join(' ')}
          >
            {selectedOption?.label ?? placeholder ?? t('ui.selectValue')}
          </span>
          <ChevronDown
            className={[styles.chevron, open ? styles.chevronOpen : null].filter(Boolean).join(' ')}
            size={18}
            strokeWidth={2}
            aria-hidden
          />
        </button>

        {open ? (
          <ul
            id={listId}
            ref={listRef}
            className={[styles.popup, placement?.up ? styles.popupUp : null]
              .filter(Boolean)
              .join(' ')}
            style={placement?.style}
            role="listbox"
            aria-labelledby={triggerId}
            /* Не отдаём фокус списку: пункт не фокусируемый, и браузер
               перевёл бы фокус на ближайшего предка — внутри модального
               окна это сам диалог. Уход фокуса закрывает список, и клик
               тогда приземляется уже в пустоту: выбор не срабатывает.
               Фокус остаётся на поле, клавиатура продолжает работать. */
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.length === 0 ? (
              <li className={styles.empty}>{t('ui.noOptions')}</li>
            ) : (
              options.map((option, i) => {
                const isSelected = option.value === selected
                return (
                  <li
                    key={option.value}
                    id={`${id}-opt-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    className={[
                      styles.option,
                      i === activeIndex ? styles.active : null,
                      isSelected ? styles.selected : null,
                      option.disabled ? styles.optionDisabled : null,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onPointerEnter={() => !option.disabled && setActiveIndex(i)}
                    onClick={() => {
                      if (option.disabled) return
                      commit(option.value)
                      close()
                      triggerRef.current?.focus()
                    }}
                  >
                    {option.icon ?? null}
                    <span className={styles.value}>{option.label}</span>
                    <Check
                      className={[styles.check, isSelected ? null : styles.checkHidden]
                        .filter(Boolean)
                        .join(' ')}
                      size={16}
                      strokeWidth={2.5}
                      aria-hidden
                    />
                  </li>
                )
              })
            )}
          </ul>
        ) : null}

        {name ? <input type="hidden" name={name} value={selected ?? ''} /> : null}
      </div>

      {message ? (
        <p className={[fieldStyles.hint, error ? fieldStyles.error : null].filter(Boolean).join(' ')}>
          {error ? (
            <CircleAlert className={fieldStyles.hintIcon} size={14} strokeWidth={2} aria-hidden />
          ) : null}
          {message}
        </p>
      ) : null}
    </div>
  )
}

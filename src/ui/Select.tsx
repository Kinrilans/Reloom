'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown, CircleAlert } from 'lucide-react'
import fieldStyles from './Field.module.css'
import styles from './Select.module.css'

export interface SelectOption {
  value: string
  label: string
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
  placeholder = 'Выберите значение',
  disabled,
  required,
  name,
  className,
}: SelectProps) {
  const id = useId()
  const triggerId = `${id}-trigger`
  const listId = `${id}-list`

  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
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

  // Если снизу не хватает места — раскрываем вверх. Считаем до отрисовки,
  // чтобы список не успел мигнуть не с той стороны.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const needed = Math.min(options.length, 6) * 36 + 16
    setDropUp(rect.bottom + needed > window.innerHeight && rect.top > needed)
  }, [open, options.length])

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
          <span
            className={[styles.value, selectedOption ? null : styles.placeholder]
              .filter(Boolean)
              .join(' ')}
          >
            {selectedOption?.label ?? placeholder}
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
            className={[styles.popup, dropUp ? styles.popupUp : null].filter(Boolean).join(' ')}
            role="listbox"
            aria-labelledby={triggerId}
          >
            {options.length === 0 ? (
              <li className={styles.empty}>Нет доступных вариантов</li>
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
                    {option.label}
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

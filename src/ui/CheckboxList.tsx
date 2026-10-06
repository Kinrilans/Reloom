'use client'

import { useI18n } from '@/i18n'
import { Checkbox } from './Field'
import fieldStyles from './Field.module.css'
import styles from './CheckboxList.module.css'
import type { SelectOption } from './Select'

export interface CheckboxListProps {
  options: SelectOption[]
  /** Отмеченные значения. Компонент управляемый: состояние живёт снаружи. */
  values: string[]
  onChange: (values: string[]) => void
  label?: string
  hint?: string
  disabled?: boolean
  className?: string
}

/**
 * Список флажков в поле с прокруткой.
 *
 * Для выбора нескольких значений — вместо выпадающего списка. Отмеченное
 * видно целиком и сразу, ничего не прячется за свёрнутым полем, и выбор
 * не прерывается закрытием списка после каждого щелчка.
 *
 * Высота ограничена пятью строками: столько помещается, не растягивая
 * окно, а остальное прокручивается.
 */
export function CheckboxList({
  options,
  values,
  onChange,
  label,
  hint,
  disabled,
  className,
}: CheckboxListProps) {
  const { t } = useI18n()

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value])
  }

  return (
    <div className={[fieldStyles.field, className].filter(Boolean).join(' ')}>
      {label ? <span className={fieldStyles.label}>{label}</span> : null}

      <div className={styles.box}>
        {options.length === 0 ? (
          <p className={styles.empty}>{t('ui.noOptions')}</p>
        ) : (
          /* Обёртка, а не класс на флажке: ширину и разделитель задаёт
             строка списка, а раскладку внутри — сам флажок. Два правила
             на одном узле разошлись бы по порядку подключения стилей. */
          options.map((option) => (
            <div className={styles.row} key={option.value}>
              <Checkbox
                label={option.label}
                checked={values.includes(option.value)}
                disabled={disabled || option.disabled}
                onChange={() => toggle(option.value)}
              />
            </div>
          ))
        )}
      </div>

      {hint ? <p className={fieldStyles.hint}>{hint}</p> : null}
    </div>
  )
}

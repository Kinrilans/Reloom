'use client'

import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { Check, CircleAlert } from 'lucide-react'
import styles from './Field.module.css'

interface FieldShellProps {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  htmlFor?: string
  children: ReactNode
}

/** Обвязка поля: подпись сверху, подсказка или ошибка снизу. */
function FieldShell({ label, hint, error, required, htmlFor, children }: FieldShellProps) {
  const message = error ?? hint
  return (
    <div className={styles.field}>
      {label ? (
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
          {required ? (
            <span className={styles.required} aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {message ? (
        <p className={[styles.hint, error ? styles.error : null].filter(Boolean).join(' ')}>
          {error ? (
            <CircleAlert className={styles.hintIcon} size={14} strokeWidth={2} aria-hidden />
          ) : null}
          {message}
        </p>
      ) : null}
    </div>
  )
}

function controlClasses(invalid: boolean, disabled?: boolean, readOnly?: boolean) {
  return [
    styles.control,
    invalid ? styles.invalid : null,
    disabled ? styles.disabled : null,
    readOnly ? styles.readOnly : null,
  ]
    .filter(Boolean)
    .join(' ')
}

/* --------------------------------------------------------------------------- */

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  hint?: string
  error?: string
  iconStart?: ReactNode
  iconEnd?: ReactNode
  /** Выравнивание вправо моноширинными цифрами — для сумм и счётчиков. */
  numeric?: boolean
}

export function Input({
  label,
  hint,
  error,
  iconStart,
  iconEnd,
  numeric,
  className,
  id,
  ...rest
}: InputProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell label={label} hint={hint} error={error} required={rest.required} htmlFor={fieldId}>
      <div className={controlClasses(Boolean(error), rest.disabled, rest.readOnly)}>
        {iconStart ? <span className={styles.adornment}>{iconStart}</span> : null}
        <input
          id={fieldId}
          className={[styles.input, numeric ? styles.numeric : null, className]
            .filter(Boolean)
            .join(' ')}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
        {iconEnd ? <span className={styles.adornment}>{iconEnd}</span> : null}
      </div>
    </FieldShell>
  )
}

/* --------------------------------------------------------------------------- */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
}

export function Textarea({ label, hint, error, className, id, ...rest }: TextareaProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell label={label} hint={hint} error={error} required={rest.required} htmlFor={fieldId}>
      <div className={controlClasses(Boolean(error), rest.disabled, rest.readOnly)}>
        <textarea
          id={fieldId}
          className={[styles.input, styles.textarea, className].filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
      </div>
    </FieldShell>
  )
}

/* --------------------------------------------------------------------------- */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
}

export function Checkbox({ label, disabled, className, ...rest }: CheckboxProps) {
  return (
    <label
      className={[styles.checkboxRow, disabled ? styles.disabled : null, className]
        .filter(Boolean)
        .join(' ')}
    >
      <input type="checkbox" className={styles.checkboxInput} disabled={disabled} {...rest} />
      <span className={styles.checkboxBox} aria-hidden>
        <Check size={14} strokeWidth={3} />
      </span>
      <span className={styles.checkboxLabel}>{label}</span>
    </label>
  )
}

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
}

export function Switch({ label, disabled, className, ...rest }: SwitchProps) {
  return (
    <label
      className={[styles.checkboxRow, disabled ? styles.disabled : null, className]
        .filter(Boolean)
        .join(' ')}
    >
      <input type="checkbox" role="switch" className={styles.checkboxInput} disabled={disabled} {...rest} />
      <span className={styles.switchTrack} aria-hidden>
        <span className={styles.switchThumb} />
      </span>
      <span className={styles.checkboxLabel}>{label}</span>
    </label>
  )
}

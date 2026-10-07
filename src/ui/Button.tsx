import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import styles from './Button.module.css'

/**
 * `onBrand`, `onBrandSoft` и `onBrandGhost` — тройка для кнопок, лежащих
 * НА фирменной заливке: экран входа, лицевая сторона карты. Обычная
 * главная кнопка там пропадает — фиолетовый градиент на фиолетовом фоне
 * не виден. Три ступени нужны там, где на одной заливке стоит выбор из
 * трёх действий и важно, какое из них основное.
 */
export type ButtonVariant =
  | 'primary'
  | 'accent'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'onBrand'
  | 'onBrandSoft'
  | 'onBrandGhost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Иконка слева от подписи. Lucide, размер подставляется по размеру кнопки. */
  iconStart?: ReactNode
  iconEnd?: ReactNode
  /** Кнопка без подписи. Обязателен aria-label — иконка не несёт смысл одна. */
  iconOnly?: boolean
  loading?: boolean
  fullWidth?: boolean
  children?: ReactNode
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 20, lg: 20 }

export function Button({
  variant = 'primary',
  size = 'md',
  iconStart,
  iconEnd,
  iconOnly = false,
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    iconOnly ? styles.iconOnly : null,
    fullWidth ? styles.fullWidth : null,
    loading ? styles.loading : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      className={classes}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <span className={[styles.content, loading ? styles.loadingLabel : null].filter(Boolean).join(' ')}>
        {iconStart}
        {iconOnly ? null : children}
        {iconEnd}
      </span>
      {loading ? (
        <span className={styles.spinner}>
          <LoaderCircle
            className={styles.spinnerIcon}
            size={ICON_SIZE[size]}
            strokeWidth={2}
            aria-hidden
          />
        </span>
      ) : null}
    </button>
  )
}

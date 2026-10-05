import type { ReactNode } from 'react'
import styles from './Badge.module.css'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

export interface BadgeProps {
  tone?: BadgeTone
  /** Плотная заливка вместо мягкой. Для единичных критических отметок. */
  solid?: boolean
  /** Точка слева. Отключается, только если вместо неё стоит иконка. */
  dot?: boolean
  icon?: ReactNode
  children: ReactNode
  className?: string
}

export function Badge({
  tone = 'neutral',
  solid = false,
  dot = true,
  icon,
  children,
  className,
}: BadgeProps) {
  const classes = [styles.badge, styles[tone], solid ? styles.solid : null, className]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes}>
      {icon ? (
        <span className={styles.icon} aria-hidden>
          {icon}
        </span>
      ) : dot ? (
        <span className={styles.dot} aria-hidden />
      ) : null}
      {children}
    </span>
  )
}

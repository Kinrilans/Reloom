import type { HTMLAttributes, ReactNode } from 'react'
import styles from './Card.module.css'

export type CardTone = 'surface' | 'nested' | 'brand'
export type CardDensity = 'roomy' | 'dense' | 'flush'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone
  /** roomy — приложение, dense — админка, flush — карточка со своей вёрсткой. */
  density?: CardDensity
  /** Зерно поверх фирменного градиента. Только для tone="brand". */
  grain?: boolean
  /** Свечение под плашкой. Только на статике (docs/brand.md). */
  glow?: boolean
  children: ReactNode
}

const TONE: Record<CardTone, string | undefined> = {
  surface: undefined,
  nested: styles.nested,
  brand: styles.brand,
}

export function Card({
  tone = 'surface',
  density = 'roomy',
  grain = false,
  glow = false,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    TONE[tone],
    styles[density],
    glow ? styles.glow : null,
    grain ? 'grain' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  )
}

export interface CardHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.titleGroup}>
        <div className={styles.title}>{title}</div>
        {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
}

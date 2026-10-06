'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useI18n } from '@/i18n'
import styles from './State.module.css'

/* --- Скелет ---------------------------------------------------------------- */

export interface SkeletonProps {
  width?: string
  height?: string
  circle?: boolean
  className?: string
}

export function Skeleton({ width, height, circle, className }: SkeletonProps) {
  const style: CSSProperties = { width, height }
  return (
    <div
      className={[styles.skeleton, circle ? styles.skeletonCircle : null, className]
        .filter(Boolean)
        .join(' ')}
      style={style}
      aria-hidden
    />
  )
}

/** Заглушка строки списка на время загрузки: кружок и две строки текста. */
export function SkeletonRow() {
  return (
    <div className={styles.skeletonRow}>
      <Skeleton width="40px" height="40px" circle />
      <div className={styles.skeletonBody}>
        <Skeleton className={styles.skeletonText} width="45%" />
        <Skeleton className={styles.skeletonText} width="28%" />
      </div>
      <Skeleton className={styles.skeletonText} width="72px" />
    </div>
  )
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  const { t } = useI18n()
  return (
    <div role="status" aria-label={t('ui.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}

/* --- Пустое состояние и ошибка --------------------------------------------- */

export interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  /** Что делать дальше. Состояние без следующего шага — недоделанное. */
  text?: ReactNode
  action?: ReactNode
  tone?: 'neutral' | 'danger'
}

export function EmptyState({ icon, title, text, action, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div className={styles.state}>
      {icon ? (
        <div
          className={[styles.stateIcon, tone === 'danger' ? styles.danger : null]
            .filter(Boolean)
            .join(' ')}
        >
          {icon}
        </div>
      ) : null}
      <div className={styles.stateTitle}>{title}</div>
      {text ? <p className={styles.stateText}>{text}</p> : null}
      {action ? <div className={styles.stateAction}>{action}</div> : null}
    </div>
  )
}

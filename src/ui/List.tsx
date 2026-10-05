import type { ReactNode } from 'react'
import styles from './List.module.css'

export interface ListProps {
  density?: 'roomy' | 'dense'
  children: ReactNode
  className?: string
}

export function List({ density = 'roomy', children, className }: ListProps) {
  return (
    <ul className={[styles.list, styles[density], className].filter(Boolean).join(' ')}>
      {children}
    </ul>
  )
}

export interface ListRowProps {
  media?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Правая колонка: сумма, статус. */
  trailing?: ReactNode
  trailingNote?: ReactNode
  onClick?: () => void
}

export function ListRow({ media, title, subtitle, trailing, trailingNote, onClick }: ListRowProps) {
  const interactive = typeof onClick === 'function'
  const content = (
    <>
      {media ? <span className={styles.media}>{media}</span> : null}
      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
      </span>
      {trailing || trailingNote ? (
        <span className={styles.trailing}>
          {trailing}
          {trailingNote ? <span className={styles.trailingNote}>{trailingNote}</span> : null}
        </span>
      ) : null}
    </>
  )

  return (
    <li>
      {interactive ? (
        <button
          type="button"
          className={[styles.row, styles.interactive].join(' ')}
          onClick={onClick}
        >
          {content}
        </button>
      ) : (
        <div className={styles.row}>{content}</div>
      )}
    </li>
  )
}

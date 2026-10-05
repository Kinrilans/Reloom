import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import styles from './Table.module.css'

export interface TableProps {
  children: ReactNode
  className?: string
}

export function Table({ children, className }: TableProps) {
  return (
    <div className={styles.wrap}>
      <table className={[styles.table, className].filter(Boolean).join(' ')}>{children}</table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className={styles.tbody}>{children}</tbody>
}

export interface TRProps {
  children: ReactNode
  onClick?: () => void
  /** Аномалия: списание больше авторизованного, forcePosted и т. п. */
  flagged?: boolean
}

export function TR({ children, onClick, flagged }: TRProps) {
  const classes = [
    styles.row,
    onClick ? styles.interactive : null,
    flagged ? styles.flagged : null,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <tr className={classes} onClick={onClick}>
      {children}
    </tr>
  )
}

type CellAlign = 'start' | 'numeric' | 'actions'

export interface THProps extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: CellAlign
}

export function TH({ align = 'start', className, children, ...rest }: THProps) {
  const alignClass = align === 'numeric' ? styles.numeric : align === 'actions' ? styles.actions : null
  return (
    <th className={[styles.th, alignClass, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </th>
  )
}

export interface TDProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: CellAlign
  /** Главная ячейка строки — имя, мерчант. Крупнее и контрастнее прочих. */
  primary?: boolean
  muted?: boolean
}

export function TD({ align = 'start', primary, muted, className, children, ...rest }: TDProps) {
  const alignClass = align === 'numeric' ? styles.numeric : align === 'actions' ? styles.actions : null
  const classes = [
    styles.td,
    alignClass,
    primary ? styles.primaryCell : null,
    muted ? styles.mutedCell : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <td className={classes} {...rest}>
      {children}
    </td>
  )
}

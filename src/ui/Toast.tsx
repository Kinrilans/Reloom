import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { Button } from './Button'
import styles from './Toast.module.css'

export type ToastTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

const ICONS: Record<ToastTone, typeof Info> = {
  neutral: Info,
  brand: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
}

export interface ToastProps {
  tone?: ToastTone
  title: ReactNode
  text?: ReactNode
  actions?: ReactNode
  onClose?: () => void
}

export function Toast({ tone = 'neutral', title, text, actions, onClose }: ToastProps) {
  const Icon = ICONS[tone]
  return (
    <div className={[styles.toast, styles[tone]].join(' ')} role="status">
      <Icon className={styles.icon} size={20} strokeWidth={2} aria-hidden />
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        {text ? <div className={styles.text}>{text}</div> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {onClose ? (
        <Button
          className={styles.close}
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Закрыть уведомление"
          onClick={onClose}
          iconStart={<X size={16} strokeWidth={2} />}
        />
      ) : null}
    </div>
  )
}

export function ToastViewport({ children }: { children: ReactNode }) {
  return <div className={styles.viewport}>{children}</div>
}

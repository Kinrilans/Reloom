'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Button } from './Button'
import styles from './Modal.module.css'

export type ModalSize = 'md' | 'lg'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** Кнопки действия. Необратимые — с подтверждением (docs/flows-admin.md). */
  footer?: ReactNode
  /** Широкое окно — для форм в две колонки. По умолчанию узкое. */
  size?: ModalSize
  children: ReactNode
}

export function Modal({ open, onClose, title, footer, size = 'md', children }: ModalProps) {
  const { t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Esc закрывает нативно — событие close ловим, чтобы состояние снаружи
  // не разошлось с реальным.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const handleClose = () => onClose()
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      className={[styles.dialog, size === 'lg' ? styles.lg : null].filter(Boolean).join(' ')}
      aria-labelledby="modal-title"
    >
      <div className={styles.inner}>
        <div className={styles.header}>
          <h2 className={styles.title} id="modal-title">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t('common.close')}
            onClick={onClose}
            iconStart={<X size={18} strokeWidth={2} />}
          />
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </dialog>
  )
}

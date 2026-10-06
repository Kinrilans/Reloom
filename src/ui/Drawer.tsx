'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Button } from './Button'
import styles from './Drawer.module.css'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  /** Кнопки действия. Остаются видимыми при прокрутке содержимого. */
  footer?: ReactNode
  children: ReactNode
}

/**
 * Боковая панель справа во всю высоту окна.
 *
 * Для карточек, которые открывают из списка и закрывают, вернувшись к
 * списку: заявка на пополнение, операция. Отдельная страница на такое
 * сбивает — оператор теряет место в списке, фильтры и прокрутку.
 *
 * Собрана на нативном <dialog>: Esc, ловушка фокуса и инертность фона
 * достаются от браузера. Прокручивается только содержимое, шапка и
 * кнопки остаются на месте.
 */
export function Drawer({ open, onClose, title, subtitle, footer, children }: DrawerProps) {
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
    <dialog ref={ref} className={styles.dialog} aria-labelledby="drawer-title">
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.heading}>
            <h2 className={styles.title} id="drawer-title">
              {title}
            </h2>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
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

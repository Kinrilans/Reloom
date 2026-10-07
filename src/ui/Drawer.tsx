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
  /** Откуда выезжает: сбоку (админка) или снизу (телефон). */
  placement?: DrawerPlacement
  /**
   * Закрывать ли щелчком по фону.
   *
   * По умолчанию — только у нижней шторки. Она показывает, а не
   * спрашивает: закрыть её тычком мимо естественно, терять там нечего.
   * В боковой панели лежат формы — отказ от заполненного окна не должен
   * случаться от промаха мимо него.
   */
  closeOnBackdrop?: boolean
  children: ReactNode
}

export type DrawerPlacement = 'side' | 'bottom'

/**
 * Панель, выезжающая из края окна.
 *
 * Сбоку — для карточек, которые открывают из списка и закрывают,
 * вернувшись к списку: заявка на пополнение, операция. Отдельная
 * страница на такое сбивает — оператор теряет место в списке, фильтры
 * и прокрутку.
 *
 * Снизу — то же самое на телефоне. Панель, выезжающая сбоку на узком
 * экране, занимает его целиком и перестаёт отличаться от перехода на
 * другой экран; снизу же видно, что прежний экран никуда не делся,
 * и закрывается она движением большого пальца, а не кнопкой в углу.
 *
 * Собрана на нативном <dialog>: Esc, ловушка фокуса и инертность фона
 * достаются от браузера. Прокручивается только содержимое, шапка и
 * кнопки остаются на месте.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  footer,
  placement = 'side',
  closeOnBackdrop = placement === 'bottom',
  children,
}: DrawerProps) {
  const { t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)
  /* Закрыли ли мы диалог сами. Нужно, чтобы отличить это от Esc и клика
     по фону: см. обработчик события close ниже. */
  const closedByUs = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) {
      closedByUs.current = true
      dialog.close()
    }
  }, [open])

  // Esc закрывает нативно — событие close ловим, чтобы состояние снаружи
  // не разошлось с реальным.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const handleClose = () => {
      // Закрытие, которое мы сами и вызвали: снаружи состояние уже
      // изменилось. Сообщать о нём обратно нельзя — иначе переход
      // «первый шаг -> второй» закрывает оба: первый диалог досылает
      // onClose и затирает только что выбранный шаг.
      if (closedByUs.current) {
        closedByUs.current = false
        return
      }
      onClose()
    }
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onClose])

  /* Щелчок по фону. У <dialog> фон — это он сам, поэтому сравниваем
     не цель события, а координаты: окно может иметь собственные поля
     (безопасная зона телефона), и щелчок по ним целью даёт сам диалог,
     хотя мимо окна человек не промахнулся.

     Нажатие с клавиатуры приходит сюда же, но без координат (0, 0) —
     и закрывало бы окно при каждом Enter по кнопке внутри. */
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !closeOnBackdrop) return
    function onClick(e: MouseEvent) {
      if (e.detail === 0) return
      const rect = (e.currentTarget as HTMLDialogElement).getBoundingClientRect()
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      if (!inside) onClose()
    }
    dialog.addEventListener('click', onClick)
    return () => dialog.removeEventListener('click', onClick)
  }, [closeOnBackdrop, onClose])

  return (
    <dialog
      ref={ref}
      className={[styles.dialog, placement === 'bottom' ? styles.bottom : null]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby="drawer-title"
    >
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

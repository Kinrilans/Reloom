'use client'

import { Coins } from 'lucide-react'
import { useI18n } from '@/i18n'
import styles from './AssetIcon.module.css'

/**
 * Значок монеты.
 *
 * Пользователь выбирает сеть глазами, и перевод в чужой сети означает
 * потерянные деньги: значок нужен, чтобы строка узнавалась быстрее,
 * чем читается.
 *
 * Пока изображение не загружено, на его месте стоит нейтральный значок
 * того же размера: тикер в кружок диаметром с него не помещается, а
 * обрезанный «USD» одинаков у USDT и USDC и только путал бы. Монета
 * названа рядом текстом.
 */
export interface AssetIconProps {
  /** Тикер: USDT, USDC. Идёт в подпись значка для экранного диктора. */
  asset: string
  /** Загруженное изображение. В прототипе — временная ссылка на файл. */
  src?: string | null
  size?: 'sm' | 'md'
}

export function AssetIcon({ asset, src, size = 'sm' }: AssetIconProps) {
  const { t } = useI18n()
  const classes = [styles.icon, size === 'md' ? styles.md : null].filter(Boolean).join(' ')

  if (src) {
    // Иконку описывает соседний текст, значок дублирует его — alt пустой.
    return <img className={classes} src={src} alt="" />
  }

  return (
    <span className={classes} title={t('ui.assetNoIcon', { asset })} aria-hidden>
      <Coins size={16} strokeWidth={1.75} />
    </span>
  )
}

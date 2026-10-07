'use client'

import { Clock, Snowflake } from 'lucide-react'
import { Amount, Card as Surface, Logo } from '@/ui'
import { useT } from '@/i18n'
import type { Card } from '@/fixtures/types'
import { CardShader } from './CardShader'
import styles from './CardFace.module.css'

export function CardFace({
  card,
  onClick,
  /** Показывать доступную сумму на лицевой стороне.
   *  На главной это основная информация, а на экране самой карты числа
   *  несут парные плитки — дублировать их на карте незачем. */
  showAmount = true,
}: {
  card: Card
  onClick?: () => void
  showAmount?: boolean
}) {
  const t = useT()
  const canceled = card.status === 'CANCELED'
  const inactive = card.status === 'FROZEN' || card.status === 'CLOSING'

  const statusIcon =
    card.status === 'FROZEN' ? <Snowflake size={16} /> : card.status === 'CLOSING' ? <Clock size={16} /> : null

  return (
    <Surface
      tone={canceled ? 'nested' : 'brand'}
      density="flush"
      grain={!canceled}
      glow={!canceled && !inactive}
      className={[
        styles.face,
        canceled ? styles.canceled : null,
        inactive ? styles.inactive : null,
      ]
        .filter(Boolean)
        .join(' ')}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      {/* Переливание — только на работающей карте. На отменённой оно
          выглядело бы как действующая (там плоская серая поверхность),
          а на замороженной отвлекало бы от причины заморозки. */}
      {canceled || inactive ? null : <CardShader cardId={card.id} />}

      <div className={styles.inner}>
        <div className={styles.top}>
          <Logo variant="mark" tone="current" height={24} />
          <span className={styles.badge}>
            {card.isPrimary ? t('card.primary') : t('card.child')}
          </span>
        </div>

        <div>
          {statusIcon || canceled ? (
            <div className={styles.status}>
              {statusIcon}
              {t(`card.status.${card.status.toLowerCase()}`)}
            </div>
          ) : showAmount ? (
            <>
              <div className={styles.label}>{t('common.available')}</div>
              <Amount
                value={card.available}
                currency={card.currency}
                size="kpi"
                onBrand={!canceled}
              />
            </>
          ) : null}
          <div className={styles.bottom}>
            <div className={styles.last4}>•••• {card.last4}</div>
            <div className={styles.expires}>{card.expires}</div>
          </div>
        </div>
      </div>
    </Surface>
  )
}

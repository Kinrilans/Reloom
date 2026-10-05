'use client'

import { useRouter } from 'next/navigation'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CreditCard,
  RotateCcw,
} from 'lucide-react'
import { Amount, ListRow } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type { Operation } from '@/fixtures/types'

const ICONS = {
  spend: CreditCard,
  deposit: ArrowDownLeft,
  withdrawal: ArrowUpRight,
  transfer: ArrowLeftRight,
  refund: RotateCcw,
}

/**
 * Строка операции.
 *
 * Название мерчанта приходит сырым (`SQ *COFFEE SHOP 4411`) и показывается
 * как есть: машинный перевод названия магазина даст мусор и сделает
 * операцию неузнаваемой (docs/i18n.md). Переводится только подпись —
 * статус или тип операции.
 */
export function OperationRow({ operation, linked = true }: { operation: Operation; linked?: boolean }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const Icon = ICONS[operation.type]

  const title = operation.merchant ?? t(operation.titleKey ?? `op.type.${operation.type}`)

  // Подпись: время, а для необычного состояния — ещё и статус.
  const showStatus = operation.status !== 'completed'
  const subtitle = showStatus
    ? `${formatDateTime(locale, operation.occurredAt)} · ${t(`op.status.${operation.status}`)}`
    : formatDateTime(locale, operation.occurredAt)

  const struck = operation.status === 'declined' || operation.status === 'reversed'

  // Сумма мерчанта — мельче под основной. В расчётах не участвует,
  // показывается только чтобы человек узнал операцию.
  const note = operation.localAmount
    ? `${operation.localAmount} ${operation.localCurrency}`
    : undefined

  return (
    <ListRow
      media={<Icon size={20} />}
      title={title}
      subtitle={subtitle}
      trailing={
        <Amount
          value={operation.amount}
          currency={operation.currency}
          size="body"
          struck={struck}
        />
      }
      trailingNote={note}
      onClick={linked ? () => router.push(`/app/history/${operation.id}`) : undefined}
    />
  )
}

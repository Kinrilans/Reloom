/**
 * Обработчик событий: событие → перечитать → применить → отметить.
 *
 * Событие **уведомление, а не запись**. В нём приходит разрешённый
 * минимум, значения — в вокабуляре эмитента в нижнем регистре.
 * Поэтому решения принимаются по результату чтения, а не по
 * содержимому события.
 *
 * Единственное исключение — **суммы авторизации**. Они живут только
 * в событии: чтение транзакции переписывает их фактически списанной
 * суммой, и задним числом исходную сумму взять неоткуда. Без неё не
 * отличить курсовую разницу от чаевых, а значит не разобрать
 * перерасход. Поэтому их снимаем с события до любого чтения.
 */

import type { PrismaClient } from '@/generated/prisma/client'
import type { OxenClient } from '../oxen'
import { applyAuthorization, applyRefund, applySettlement } from '../services/mirror'
import { cardEventDataSchema, transactionEventDataSchema } from './schemas'

export class EventError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'EventError'
    this.code = code
  }
}

export interface ApplyDeps {
  prisma: PrismaClient
  oxen: OxenClient
}

export interface StoredEvent {
  id: string
  type: string
  data: unknown
}

export type ApplyOutcome =
  /** Применили. */
  | { kind: 'APPLIED'; what: string }
  /** Ничего делать не надо: такой тип событий нас не касается. */
  | { kind: 'IGNORED'; why: string }

/**
 * Применить событие.
 *
 * Неизвестный тип — не ошибка: эмитент волен присылать что угодно,
 * и падать на незнакомом событии значит остановить всю очередь из-за
 * того, что нас не касается.
 */
export async function applyEvent(deps: ApplyDeps, event: StoredEvent): Promise<ApplyOutcome> {
  if (event.type.startsWith('transaction.')) return applyTransactionEvent(deps, event)
  if (event.type.startsWith('card.')) return applyCardEvent(deps, event)

  if (event.type === 'challenge.requested') {
    // Доставка 3DS-кода появляется на этапе 5. Содержимое события
    // у нас не хранится принципиально (см. `redactForStorage`), и
    // пришедший догоном код всё равно уже просрочен.
    return { kind: 'IGNORED', why: 'доставка 3DS появляется на этапе 5' }
  }

  return { kind: 'IGNORED', why: `неизвестный тип события: ${event.type}` }
}

/* --------------------------------------------------------------------------
   Транзакции
   -------------------------------------------------------------------------- */

async function applyTransactionEvent(
  deps: ApplyDeps,
  event: StoredEvent,
): Promise<ApplyOutcome> {
  const parsed = transactionEventDataSchema.safeParse(event.data)
  if (!parsed.success) {
    throw new EventError('BAD_EVENT_DATA', 'В событии о транзакции нет идентификатора')
  }
  const data = parsed.data

  // Суммы авторизации — единственное, что берётся из события.
  const authorized =
    event.type === 'transaction.created'
      ? { amountMinor: data.amount, localAmount: data.localAmount }
      : undefined

  const card = await resolveCard(deps.prisma, data.cardId, data.id)

  // А дальше — только то, что сказало чтение.
  const read = await deps.oxen.getTransaction(data.id)
  const occurredAt = parseDate(data.occurredAt)

  if (isRefund(read.type)) {
    // Возврат проводится по фактически полученной сумме. В чужой
    // валюте она считается по курсу возврата и может отличаться от
    // списанной при покупке в обе стороны.
    await applyRefund(deps.prisma, {
      id: read.id,
      cardId: card.id,
      receivedMinor: read.amountMinor,
      ...(read.localAmountMinor !== undefined ? { localAmount: read.localAmountMinor } : {}),
      ...(read.localCurrency !== undefined ? { localCurrency: read.localCurrency } : {}),
      ...(data.merchantName !== undefined ? { merchantName: data.merchantName } : {}),
      occurredAt,
    })
    return { kind: 'APPLIED', what: 'REFUND' }
  }

  if (isSettled(read.status, event.type)) {
    // Проводка — по сумме сеттлмента, не авторизации. Курсовая
    // разница между ними не теряется и не удваивается.
    await applySettlement(deps.prisma, {
      id: read.id,
      settledMinor: read.amountMinor,
      occurredAt,
      // Если авторизации мы не видели — вебхук был потерян, а догон
      // принёс сразу оседание, — зеркало достраивается здесь.
      fallback: {
        cardId: card.id,
        ...(data.merchantName !== undefined ? { merchantName: data.merchantName } : {}),
        ...(read.localAmountMinor !== undefined ? { localAmount: read.localAmountMinor } : {}),
        ...(read.localCurrency !== undefined ? { localCurrency: read.localCurrency } : {}),
      },
    })
    return { kind: 'APPLIED', what: 'SPEND' }
  }

  // Авторизация: резерв есть, проводки нет.
  await applyAuthorization(deps.prisma, {
    id: read.id,
    cardId: card.id,
    amountMinor: authorized?.amountMinor ?? read.amountMinor,
    ...(authorized?.localAmount !== undefined ? { localAmount: authorized.localAmount } : {}),
    ...(data.localCurrency !== undefined ? { localCurrency: data.localCurrency } : {}),
    ...(data.merchantName !== undefined ? { merchantName: data.merchantName } : {}),
    occurredAt,
  })
  return { kind: 'APPLIED', what: 'AUTHORIZATION' }
}

/**
 * Осела ли операция.
 *
 * Имя и значения поля статуса в чтении не подтверждены, поэтому есть
 * запасной путь: событие об обновлении транзакции само по себе
 * означает, что холд сменился списанием.
 */
function isSettled(status: string | undefined, eventType: string): boolean {
  if (status) return status.toUpperCase() === 'SETTLED'
  return eventType === 'transaction.updated'
}

function isRefund(type: string | undefined): boolean {
  return type?.toUpperCase() === 'REFUND'
}

/**
 * Найти нашу карту.
 *
 * Сначала по идентификатору из события. События об изменении
 * транзакции его не несут — тогда карта берётся из уже записанного
 * зеркала: авторизацию по этой транзакции мы видели раньше.
 *
 * Если не нашлось ни там, ни там — угадывать нечего. Событие остаётся
 * в очереди с понятной ошибкой, и его разбирает человек.
 */
async function resolveCard(
  prisma: PrismaClient,
  oxenCardId: string | undefined,
  transactionId: string,
) {
  if (oxenCardId) {
    const card = await prisma.card.findUnique({ where: { oxenCardId } })
    if (!card) {
      throw new EventError('UNKNOWN_CARD', `Карта ${oxenCardId} у нас не заведена`)
    }
    return card
  }

  const mirrored = await prisma.cardTransaction.findUnique({
    where: { id: transactionId },
    include: { card: true },
  })
  if (mirrored) return mirrored.card

  throw new EventError(
    'NO_CARD_IN_EVENT',
    `В событии нет карты, и транзакции ${transactionId} в зеркале тоже нет`,
  )
}

/* --------------------------------------------------------------------------
   Карты
   -------------------------------------------------------------------------- */

/**
 * Статус карты поменялся.
 *
 * Событие несёт статус в вокабуляре эмитента, и сравнивать его с нашим
 * перечислением нельзя — поэтому читаем карту и действуем по чтению.
 *
 * Наш статус `CLOSING` у эмитента выглядит как `FROZEN`: карта
 * заморожена и помечена к закрытию. Перетирать его на `FROZEN` нельзя,
 * иначе потеряется намерение закрыть карту и выбранный план переноса
 * остатка.
 */
async function applyCardEvent(deps: ApplyDeps, event: StoredEvent): Promise<ApplyOutcome> {
  const parsed = cardEventDataSchema.safeParse(event.data)
  if (!parsed.success) {
    throw new EventError('BAD_EVENT_DATA', 'В событии о карте нет идентификатора')
  }

  const ours = await deps.prisma.card.findUnique({ where: { oxenCardId: parsed.data.id } })
  if (!ours) return { kind: 'IGNORED', why: `карта ${parsed.data.id} у нас не заведена` }

  const read = await deps.oxen.getCard(parsed.data.id)

  if (read.status === 'CANCELED') {
    // Терминальное состояние и необратимое: знать о нём обязательно.
    if (ours.status === 'CANCELED') return { kind: 'IGNORED', why: 'статус уже совпадает' }
    await deps.prisma.card.update({
      where: { id: ours.id },
      data: { status: 'CANCELED', freezeReason: null },
    })
    return { kind: 'APPLIED', what: 'CARD_CANCELED' }
  }

  if (ours.status === 'CLOSING') {
    return { kind: 'IGNORED', why: 'карта закрывается, её состояние ведём мы' }
  }

  if (read.status === ours.status) return { kind: 'IGNORED', why: 'статус уже совпадает' }

  if (read.status === 'FROZEN') {
    // Заморозка, которой мы не делали: так эмитент останавливает
    // карту сам. Причину отмечаем отдельной — иначе зачисление
    // в плюс разморозит карту, которую замораживали не из-за минуса.
    await deps.prisma.card.update({
      where: { id: ours.id },
      data: { status: 'FROZEN', freezeReason: ours.freezeReason ?? 'BY_ISSUER' },
    })
    return { kind: 'APPLIED', what: 'CARD_FROZEN' }
  }

  await deps.prisma.card.update({
    where: { id: ours.id },
    data: { status: 'ACTIVE', freezeReason: null },
  })
  return { kind: 'APPLIED', what: 'CARD_ACTIVE' }
}

function parseDate(value: string | undefined): Date {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

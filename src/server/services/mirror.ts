/**
 * Зеркало транзакций эмитента и проводки по ним.
 *
 * Три правила, каждое из которых оплачено чужими ошибками.
 *
 * 1. **Авторизация проводки не создаёт.** Она ставит резерв: деньги
 *    обещаны мерчанту, но не списаны. Проводка появляется на
 *    сеттлменте.
 * 2. **Проводка `SPEND` — по фактической сумме сеттлмента**, не по
 *    сумме авторизации. Между ними уходит курс, и проводка по
 *    авторизации разъедет баланс с реальностью на величину курсовой
 *    разницы. Накопленное расхождение потом не восстановить.
 * 3. **`authorizedAmount` сохраняется один раз, из события.** Чтение
 *    транзакции у эмитента затирает это поле фактически списанной
 *    суммой. Задним числом исходную авторизацию взять неоткуда, а без
 *    неё не отличить курсовую разницу от чаевых.
 */

import type { PrismaClient } from '@/generated/prisma/client'
import type { Minor } from '@/shared/money'
import { post, refundEntries, spendEntries } from '../ledger'
import { syncFreezeWithBalance } from './cards'

export class MirrorError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'MirrorError'
    this.code = code
  }
}

export interface AuthorizationEvent {
  /** UUID транзакции у эмитента. */
  id: string
  cardId: string
  amountMinor: Minor
  localAmount?: Minor
  localCurrency?: string
  merchantName?: string
  occurredAt: Date
  raw?: unknown
}

/**
 * Одобренная, но не списанная операция.
 *
 * Увеличивает резерв карты, и значит сразу уменьшает доступное: эти
 * деньги уже обещаны. Леджер не трогает.
 */
export async function applyAuthorization(
  prisma: PrismaClient,
  event: AuthorizationEvent,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.cardTransaction.findUnique({ where: { id: event.id } })
    if (existing) return // повторная доставка события

    const card = await tx.card.findUnique({ where: { id: event.cardId }, include: { user: true } })
    if (!card) throw new MirrorError('CARD_NOT_FOUND', `Карты ${event.cardId} нет`)

    await tx.cardTransaction.create({
      data: {
        id: event.id,
        cardId: card.id,
        userId: card.userId,
        companyId: card.user.companyId,
        type: 'AUTHORIZATION',
        status: 'AUTHORIZED',
        amountMinor: event.amountMinor,
        localAmount: event.localAmount ?? null,
        localCurrency: event.localCurrency ?? null,
        // Сохраняется ЗДЕСЬ и больше не трогается никогда.
        authorizedAmount: event.amountMinor,
        authorizedLocalAmount: event.localAmount ?? null,
        merchantName: event.merchantName ?? null,
        occurredAt: event.occurredAt,
        raw: (event.raw ?? {}) as object,
      },
    })

    await tx.card.update({
      where: { id: card.id },
      data: { pendingMinor: { increment: event.amountMinor } },
    })
  })
}

/**
 * Списание осело.
 *
 * Резерв снимается по сумме, которой он ставился, а осевшая сумма
 * уходит в `settled` и в проводку. Разница между ними — курсовая,
 * чаевые или доплата мерчанта — не теряется: она остаётся в остатке
 * карты и дальше работает общими правилами перерасхода.
 */
export async function applySettlement(
  prisma: PrismaClient,
  input: {
    id: string
    settledMinor: Minor
    occurredAt?: Date
    /**
     * Чем достроить зеркало, если авторизации мы не видели.
     *
     * Так бывает, когда вебхук о создании транзакции потерян, а догон
     * принёс сразу оседание. Строка заводится сразу осевшей, и поле
     * авторизации остаётся **пустым**: подставить туда фактическую
     * сумму значило бы соврать, что холд был именно таким, и
     * курсовую разницу потом было бы не отличить от чаевых.
     */
    fallback?: { cardId: string; merchantName?: string; localAmount?: Minor; localCurrency?: string }
  },
): Promise<{ ledgerTransactionId: string; alreadyExisted: boolean }> {
  return prisma.$transaction(async (tx) => {
    let record = await tx.cardTransaction.findUnique({ where: { id: input.id } })

    if (!record && input.fallback) {
      const card = await tx.card.findUnique({
        where: { id: input.fallback.cardId },
        include: { user: true },
      })
      if (!card) throw new MirrorError('CARD_NOT_FOUND', `Карты ${input.fallback.cardId} нет`)
      record = await tx.cardTransaction.create({
        data: {
          id: input.id,
          cardId: card.id,
          userId: card.userId,
          companyId: card.user.companyId,
          type: 'SPEND',
          status: 'AUTHORIZED',
          amountMinor: input.settledMinor,
          localAmount: input.fallback.localAmount ?? null,
          localCurrency: input.fallback.localCurrency ?? null,
          // Авторизации мы не видели — поле остаётся пустым.
          authorizedAmount: null,
          merchantName: input.fallback.merchantName ?? null,
          occurredAt: input.occurredAt ?? new Date(),
          raw: {},
        },
      })
    }

    if (!record) throw new MirrorError('TX_NOT_FOUND', `Транзакции ${input.id} нет`)

    // Резерв снимается по сумме, которой он ставился. Если
    // авторизации мы не видели, резерва и не было — снимать нечего.
    const reserved =
      record.status === 'AUTHORIZED' && record.authorizedAmount !== null
        ? record.authorizedAmount
        : 0n

    if (record.status !== 'AUTHORIZED' && record.status !== 'SETTLED') {
      throw new MirrorError('BAD_STATUS', `Транзакция в состоянии ${record.status} не оседает`)
    }

    const posted = await post(tx, {
      type: 'SPEND',
      companyId: record.companyId,
      userId: record.userId,
      sourceType: 'CARD_TX',
      sourceId: record.id,
      entries: spendEntries(record.userId, input.settledMinor),
    })

    if (posted.alreadyExisted) {
      return { ledgerTransactionId: posted.id, alreadyExisted: true }
    }

    await tx.cardTransaction.update({
      where: { id: record.id },
      data: {
        type: 'SPEND',
        status: 'SETTLED',
        // Сумма расчёта обновляется на фактическую...
        amountMinor: input.settledMinor,
        // ...а поля авторизации НЕ трогаются. Это не экономия строк,
        // это и есть правило 3 из шапки файла.
        occurredAt: input.occurredAt ?? record.occurredAt,
      },
    })

    await tx.card.update({
      where: { id: record.cardId },
      data: {
        pendingMinor: { decrement: reserved },
        settledMinor: { increment: input.settledMinor },
      },
    })

    await syncFreezeWithBalance(tx, record.userId)
    return { ledgerTransactionId: posted.id, alreadyExisted: false }
  })
}

/**
 * Возврат от мерчанта.
 *
 * Проводится по **фактически полученной** сумме. В чужой валюте она
 * считается по курсу на момент возврата и может отличаться от списанной
 * при покупке в обе стороны. Разница не компенсируется и
 * корректировкой не правится: это реальный результат конвертации,
 * а не наша ошибка.
 */
export async function applyRefund(
  prisma: PrismaClient,
  input: {
    id: string
    cardId: string
    receivedMinor: Minor
    localAmount?: Minor
    localCurrency?: string
    merchantName?: string
    occurredAt: Date
  },
): Promise<{ ledgerTransactionId: string; alreadyExisted: boolean }> {
  return prisma.$transaction(async (tx) => {
    const card = await tx.card.findUnique({ where: { id: input.cardId }, include: { user: true } })
    if (!card) throw new MirrorError('CARD_NOT_FOUND', `Карты ${input.cardId} нет`)

    const posted = await post(tx, {
      type: 'REFUND',
      companyId: card.user.companyId,
      userId: card.userId,
      sourceType: 'CARD_TX',
      sourceId: input.id,
      entries: refundEntries(card.userId, input.receivedMinor),
    })
    if (posted.alreadyExisted) {
      return { ledgerTransactionId: posted.id, alreadyExisted: true }
    }

    await tx.cardTransaction.create({
      data: {
        id: input.id,
        cardId: card.id,
        userId: card.userId,
        companyId: card.user.companyId,
        type: 'REFUND',
        status: 'SETTLED',
        amountMinor: input.receivedMinor,
        localAmount: input.localAmount ?? null,
        localCurrency: input.localCurrency ?? null,
        merchantName: input.merchantName ?? null,
        occurredAt: input.occurredAt,
        raw: {},
      },
    })

    // Возврат освобождает потраченное — остаток карты растёт.
    await tx.card.update({
      where: { id: card.id },
      data: { settledMinor: { decrement: input.receivedMinor } },
    })

    await syncFreezeWithBalance(tx, card.userId)
    return { ledgerTransactionId: posted.id, alreadyExisted: false }
  })
}

/**
 * Перечитать транзакцию у эмитента.
 *
 * Обновляет то, что может измениться, и **никогда** не трогает поля
 * авторизации. У эмитента они к этому моменту уже затёрты фактической
 * суммой: перечитав их, мы потеряем единственный экземпляр исходных
 * данных.
 */
export async function refreshFromIssuer(
  prisma: PrismaClient,
  input: {
    id: string
    amountMinor: Minor
    status: string
    declineReason?: string
    forcePosted?: boolean
  },
): Promise<void> {
  await prisma.cardTransaction.update({
    where: { id: input.id },
    data: {
      amountMinor: input.amountMinor,
      status: input.status,
      declineReason: input.declineReason ?? null,
      forcePosted: input.forcePosted ?? null,
    },
  })
}

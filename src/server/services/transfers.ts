/**
 * Перевод между картами.
 *
 * Для пользователя это «перевести 200 с главной на дочернюю». На самом
 * деле — два пересчёта лимита, и **баланс пользователя не меняется**.
 * Поэтому перевод не является проводкой леджера: он пишется в свой
 * журнал и в аудит.
 *
 * ПОРЯДОК ОБЯЗАТЕЛЕН: сначала уменьшить источник, потом увеличить
 * получателя. Два вызова наружу не атомарны. Если первым увеличить
 * получателя и второй вызов упадёт — человек получит 200 из воздуха и
 * сможет потратить их дважды. При правильном порядке сбой второго
 * вызова означает лишь временно недоступные 200, которые вернёт
 * повторная попытка.
 *
 * Состояние сохраняется ДО первого вызова наружу. Иначе процесс,
 * упавший между вызовами, не оставит следа, и деньги зависнут без
 * возможности узнать, что с ними случилось.
 */

import type { PrismaClient } from '@/generated/prisma/client'
import type { Minor } from '@/shared/money'
import { freeToMove, limitAfterCredit, limitAfterDebit } from '../domain/limits'
import type { CardLimitPort } from '../domain/ports'
import { assertSolvencyAfter, LIVE_STATUSES, money } from './cards'

export class TransferError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'TransferError'
    this.code = code
  }
}

export interface TransferResult {
  transferId: string
  status: 'COMPLETED' | 'SOURCE_REDUCED' | 'FAILED'
  error?: string
}

/**
 * Начать и, если получится, завершить перевод.
 *
 * Возврат со статусом `SOURCE_REDUCED` — это не успех и не потеря:
 * деньги сняты с источника и ждут зачисления на получателя. Такой
 * перевод добирается `resumeTransfer`.
 */
export async function transfer(
  prisma: PrismaClient,
  port: CardLimitPort,
  input: { userId: string; fromCardId: string; toCardId: string; amountMinor: Minor },
): Promise<TransferResult> {
  const { userId, fromCardId, toCardId, amountMinor } = input

  if (amountMinor <= 0n) {
    throw new TransferError('BAD_AMOUNT', 'Сумма перевода должна быть положительной')
  }
  if (fromCardId === toCardId) {
    throw new TransferError('SAME_CARD', 'Перевод самому себе ничего не меняет')
  }

  const transferId = await prisma.$transaction(async (tx) => {
    const cards = await tx.card.findMany({ where: { id: { in: [fromCardId, toCardId] } } })
    const from = cards.find((card) => card.id === fromCardId)
    const to = cards.find((card) => card.id === toCardId)

    if (!from || !to) throw new TransferError('CARD_NOT_FOUND', 'Одной из карт нет')
    if (from.userId !== userId || to.userId !== userId) {
      throw new TransferError('FOREIGN_CARD', 'Перевод возможен только между своими картами')
    }
    for (const card of [from, to]) {
      if (!LIVE_STATUSES.includes(card.status as (typeof LIVE_STATUSES)[number])) {
        throw new TransferError('CARD_TERMINAL', 'Перевод по отменённой карте невозможен')
      }
    }
    // На закрывающуюся карту переводить нечего: с неё как раз уносят.
    if (to.status === 'CLOSING') {
      throw new TransferError('TARGET_CLOSING', 'Карта закрывается, зачислять на неё нельзя')
    }

    const available = freeToMove(money(from))
    if (amountMinor > available) {
      throw new TransferError(
        'INSUFFICIENT_CARD_FUNDS',
        `На карте свободно ${available}, просят ${amountMinor}`,
      )
    }

    const created = await tx.cardTransfer.create({
      data: { userId, fromCardId, toCardId, amountMinor, status: 'PENDING' },
    })
    return created.id
  })

  return runTransfer(prisma, port, transferId)
}

/**
 * Добрать незавершённый перевод.
 *
 * Вызывается фоновым процессом по переводам, застрявшим в `PENDING`
 * или `SOURCE_REDUCED`. Безопасен к повтору: каждый шаг выставляет
 * абсолютный потолок, а не прибавку, поэтому повторное применение того
 * же шага ничего не меняет.
 */
export async function resumeTransfer(
  prisma: PrismaClient,
  port: CardLimitPort,
  transferId: string,
): Promise<TransferResult> {
  return runTransfer(prisma, port, transferId)
}

async function runTransfer(
  prisma: PrismaClient,
  port: CardLimitPort,
  transferId: string,
): Promise<TransferResult> {
  const record = await prisma.cardTransfer.findUnique({ where: { id: transferId } })
  if (!record) throw new TransferError('TRANSFER_NOT_FOUND', `Перевода ${transferId} нет`)
  if (record.status === 'COMPLETED') {
    return { transferId, status: 'COMPLETED' }
  }

  // Шаг 1: уменьшить источник. Пока он не выполнен, деньги числятся
  // на источнике и ничего плохого не произошло.
  if (record.status === 'PENDING' || record.status === 'FAILED') {
    try {
      await prisma.$transaction(async (tx) => {
        const from = await tx.card.findUniqueOrThrow({ where: { id: record.fromCardId } })
        const newLimit = limitAfterDebit(money(from), record.amountMinor)
        await assertSolvencyAfter(tx, record.userId, from.id, newLimit)
        await port.setLimit(from.oxenCardId, newLimit)
        await tx.card.update({ where: { id: from.id }, data: { appliedLimit: newLimit } })
        await tx.cardTransfer.update({
          where: { id: transferId },
          data: { status: 'SOURCE_REDUCED', error: null },
        })
      })
    } catch (error) {
      const message = describe(error)
      await prisma.cardTransfer.update({
        where: { id: transferId },
        data: { status: 'FAILED', error: message },
      })
      return { transferId, status: 'FAILED', error: message }
    }
  }

  // Шаг 2: увеличить получателя. Если упадёт — перевод остаётся
  // в `SOURCE_REDUCED`: деньги сняты, но не зачислены. Это временная
  // недоступность, а не потеря, и добирается она повтором.
  try {
    await prisma.$transaction(async (tx) => {
      const to = await tx.card.findUniqueOrThrow({ where: { id: record.toCardId } })
      const newLimit = limitAfterCredit(money(to), record.amountMinor)
      await assertSolvencyAfter(tx, record.userId, to.id, newLimit)
      await port.setLimit(to.oxenCardId, newLimit)
      await tx.card.update({ where: { id: to.id }, data: { appliedLimit: newLimit } })
      await tx.cardTransfer.update({
        where: { id: transferId },
        data: { status: 'COMPLETED', error: null },
      })
    })
  } catch (error) {
    const message = describe(error)
    await prisma.cardTransfer.update({
      where: { id: transferId },
      data: { status: 'SOURCE_REDUCED', error: message },
    })
    return { transferId, status: 'SOURCE_REDUCED', error: message }
  }

  return { transferId, status: 'COMPLETED' }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

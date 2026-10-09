/**
 * Отправка возврата с записью намерения.
 *
 * Самая опасная операция во всей системе: ею уходят чужие деньги, и
 * ошибка здесь необратима. Поэтому порядок такой же, как при выпуске
 * карты, только строже.
 *
 * 1. Намерение с идемпотентным ключом пишется в базу **до** вызова.
 * 2. Вызов делается ровно один раз.
 * 3. Неоднозначный ответ **не повторяется**. Состояние выясняется
 *    чтением: `resolveRefund` смотрит, ушёл ли возврат на самом деле.
 *
 * Идемпотентен ли их вызов отправки — открытый вопрос
 * (`docs/crypto-integration.md`). Пока ответа нет, исходим из худшего.
 */

import type { PrismaClient } from '@/generated/prisma/client'
import { markDone, markFailed, markSent, reserveIntent } from '../db/intents'
import type { Refund, WalletClient } from './types'

export interface RefundOutcome {
  /** Возврат, если про него известно. */
  refund: Refund | undefined
  /**
   * Состояние неизвестно: вызов сделан, ответ не получен, и повторять
   * нельзя. Разбирается чтением, а если и оно молчит — человеком.
   */
  unresolved: boolean
  error: string | undefined
}

/**
 * Отправить возврат ровно один раз.
 *
 * `depositId` — наш идентификатор поступления. По нему находится
 * намерение при повторном заходе, и второй отправки не происходит.
 */
export async function sendRefundOnce(
  client: WalletClient,
  prisma: PrismaClient,
  depositId: string,
  input: { chainTxId: string; toAddress: string },
): Promise<RefundOutcome> {
  const intent = await reserveIntent(prisma, {
    service: 'WALLET',
    operation: 'SEND_REFUND',
    subjectType: 'DEPOSIT',
    subjectId: depositId,
  })

  // Возврат уже уходил — повторять нечего, читаем результат.
  if (intent.completedResultId) {
    const refund = await client.getRefund(intent.completedResultId)
    return { refund, unresolved: false, error: undefined }
  }

  await markSent(prisma, intent.key)

  try {
    const refund = await client.sendRefund(input, { key: intent.key })
    await markDone(prisma, intent.key, refund.id)
    return { refund, unresolved: false, error: undefined }
  } catch (error) {
    const message = describe(error)
    await markFailed(prisma, intent.key, message)
    // Ключевое место: НЕ повторяем. Деньги могли уйти.
    return { refund: undefined, unresolved: true, error: message }
  }
}

/**
 * Выяснить, ушёл ли возврат, после неоднозначного ответа.
 *
 * Единственный допустимый способ разобраться: прочитать. Повторная
 * отправка в этой ситуации — вторая отправка денег.
 *
 * `lookup` ищет возврат по транзакции в сети. Как именно — зависит от
 * их API; пока это открытый вопрос, и функция принимает поиск снаружи,
 * вместо того чтобы угадывать маршрут.
 */
export async function resolveRefund(
  prisma: PrismaClient,
  depositId: string,
  lookup: () => Promise<Refund | undefined>,
): Promise<RefundOutcome> {
  const found = await lookup()
  if (!found) {
    return { refund: undefined, unresolved: true, error: 'возврат не найден у сервиса' }
  }

  const intent = await reserveIntent(prisma, {
    service: 'WALLET',
    operation: 'SEND_REFUND',
    subjectType: 'DEPOSIT',
    subjectId: depositId,
  })
  await markDone(prisma, intent.key, found.id)
  return { refund: found, unresolved: false, error: undefined }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

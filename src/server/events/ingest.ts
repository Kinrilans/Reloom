/**
 * Приём события в очередь.
 *
 * Одно и то же событие приходит и вебхуком, и догоном — это штатно,
 * а не сбой. Поэтому запись идёт по первичному ключу `evt_…`:
 * дедупликация стоит **в базе**, а не в коде. Проверка «а нет ли уже
 * такого» проигрывает гонку, когда вебхук и догон приносят событие
 * одновременно; уникальный ключ не проигрывает.
 *
 * Событие сначала **сохраняется**, и только потом обрабатывается.
 * Обратный порядок означает, что упавший на обработке процесс теряет
 * событие навсегда: повторной доставки у эмитента нет.
 */

import type { PrismaClient } from '@/generated/prisma/client'
import { record } from '../exchange'

export interface IngestInput {
  id: string
  type: string
  data: unknown
  occurredAt?: Date
}

export interface IngestResult {
  /** Событие увидено впервые. Повтор — не ошибка. */
  stored: boolean
  /** Уже обработано: повторный заход ничего делать не должен. */
  alreadyProcessed: boolean
}

export async function ingest(prisma: PrismaClient, input: IngestInput): Promise<IngestResult> {
  const existing = await prisma.oxenEvent.findUnique({ where: { id: input.id } })
  if (existing) {
    // Повтор тоже попадает в журнал обмена: при разборе важно видеть,
    // что событие приходило дважды, а не гадать, почему его нет.
    await noteIncoming(prisma, input, { stored: false })
    return { stored: false, alreadyProcessed: existing.processedAt !== null }
  }

  try {
    await prisma.oxenEvent.create({
      data: {
        id: input.id,
        type: input.type,
        occurredAt: input.occurredAt ?? new Date(),
        subject: {},
        data: toJson(input.data),
      },
    })
    await noteIncoming(prisma, input, { stored: true })
    return { stored: true, alreadyProcessed: false }
  } catch (error) {
    // Гонка вебхука с догоном: оба принесли одно событие. Это штатно —
    // выигравший его записал, проигравший просто ничего не делает.
    if (isUniqueViolation(error)) {
      await noteIncoming(prisma, input, { stored: false })
      return { stored: false, alreadyProcessed: false }
    }
    throw error
  }
}

/**
 * Запись в журнал обмена о принятом событии.
 *
 * Тело берётся **уже вычищенным**: сюда оно приходит после
 * `redactForStorage`, и у событий с одноразовым кодом от него остаётся
 * только отметка о вычистке.
 */
async function noteIncoming(
  prisma: PrismaClient,
  input: IngestInput,
  outcome: { stored: boolean },
): Promise<void> {
  await record(prisma, {
    service: 'OXEN',
    direction: 'IN',
    method: 'EVENT',
    path: input.type,
    operation: input.type,
    subject: input.id,
    outcome: 'OK',
    durationMs: 0,
    response: { stored: outcome.stored },
  })
}

/** Отметить обработанным. Пока отметки нет, событие висит в очереди
 *  и видно в индикаторе отставания. */
export async function markProcessed(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.oxenEvent.update({
    where: { id },
    data: { processedAt: new Date(), error: null },
  })
}

/**
 * Отметить, что обработка не удалась.
 *
 * `processedAt` НЕ ставится: событие остаётся в очереди и попадёт
 * в следующий заход. Отметить его обработанным ради чистоты очереди
 * значило бы потерять операцию по карте.
 */
export async function markFailed(prisma: PrismaClient, id: string, error: string): Promise<void> {
  await prisma.oxenEvent.update({ where: { id }, data: { error } })
}

/** Необработанные события, старые сверху. */
export async function pending(prisma: PrismaClient, take = 100) {
  return prisma.oxenEvent.findMany({
    where: { processedAt: null },
    orderBy: { receivedAt: 'asc' },
    take,
  })
}

function toJson(data: unknown): object {
  return (data ?? {}) as object
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  )
}

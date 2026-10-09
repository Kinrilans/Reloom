/**
 * Хранилище идемпотентных ключей — одно на все исходящие сервисы.
 *
 * Ключ генерируем мы и **сохраняем в базу до отправки запроса**
 * вместе с намерением.
 *
 * Зачем так. Процесс может упасть между отправкой и ответом. Без
 * записанного заранее намерения мы не узнаем, был ли выпущен
 * картхолдер, выпущена ли карта, ушёл ли возврат: у себя следов нет,
 * а спросить сервис не по чему. Повторная попытка выпустит вторую
 * карту или отправит деньги второй раз, и оба случая необратимы.
 *
 * С записанным намерением повтор берёт **тот же ключ**, и сервис,
 * если он идемпотентен, отдаёт результат первой попытки вместо
 * создания второго ресурса. Если он не идемпотентен — повтор не
 * делается вовсе, а состояние выясняется чтением.
 */

import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@/generated/prisma/client'

export type IntentService = 'OXEN' | 'WALLET'
export type IntentOperation = 'CREATE_CARDHOLDER' | 'ISSUE_CARD' | 'SEND_REFUND'
export type IntentSubjectType = 'USER' | 'CARD' | 'DEPOSIT'

export interface ReservedIntent {
  key: string
  /** Намерение уже доводилось до конца: вот что получилось. */
  completedResultId: string | null
}

/**
 * Застолбить намерение.
 *
 * Если по этому предмету намерение уже есть — возвращается оно, с тем
 * же ключом. Новый ключ под тот же предмет означал бы второй ресурс
 * у эмитента.
 */
export async function reserveIntent(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    service: IntentService
    operation: IntentOperation
    subjectType: IntentSubjectType
    subjectId: string
  },
): Promise<ReservedIntent> {
  const where = {
    service_operation_subjectType_subjectId: {
      service: input.service,
      operation: input.operation,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    },
  }

  const existing = await db.outboundIntent.findUnique({ where })
  if (existing) {
    return {
      key: existing.key,
      completedResultId: existing.status === 'DONE' ? existing.resultId : null,
    }
  }

  const created = await db.outboundIntent.create({
    data: {
      key: randomUUID(),
      service: input.service,
      operation: input.operation,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      status: 'INTENT',
    },
  })
  return { key: created.key, completedResultId: null }
}

/** Запрос ушёл. Отметка нужна, чтобы отличить «не отправляли» от
 *  «отправили и не дождались ответа». */
export async function markSent(
  db: PrismaClient | Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await db.outboundIntent.update({ where: { key }, data: { status: 'SENT' } })
}

/** Ресурс создан. Дальше по этому ключу ничего не отправляется. */
export async function markDone(
  db: PrismaClient | Prisma.TransactionClient,
  key: string,
  resultId: string,
  requestId?: string,
): Promise<void> {
  await db.outboundIntent.update({
    where: { key },
    data: { status: 'DONE', resultId, requestId: requestId ?? null, error: null },
  })
}

/**
 * Попытка кончилась отказом.
 *
 * Намерение остаётся в базе, и статус `FAILED` не означает «можно
 * начинать заново с нового ключа». Он означает «известно, чем
 * кончилось»; повтор пойдёт с тем же ключом.
 */
export async function markFailed(
  db: PrismaClient | Prisma.TransactionClient,
  key: string,
  error: string,
  requestId?: string,
): Promise<void> {
  await db.outboundIntent.update({
    where: { key },
    data: { status: 'FAILED', error, requestId: requestId ?? null },
  })
}

/**
 * Журнал обмена: что ушло наружу и что пришло обратно.
 *
 * Один журнал на три сервиса — эмитент, сервис адресов, проверка
 * происхождения. Механика разбора у них одна, а три отдельных журнала
 * через полгода стали бы тремя разными его версиями.
 *
 * Записывается на уровне **адаптера**, а не HTTP-клиента, нарочно:
 * на моке HTTP-запросов нет вовсе, и журнал, завязанный на них, был бы
 * пуст именно в том режиме, в котором идёт разработка. Цена — в записи
 * нет настоящего кода ответа на успехе; `requestId` и код ошибки
 * достаются из типизированной ошибки, а это как раз то, с чем
 * обращаются в поддержку.
 *
 * Тела записываются **уже вычищенными**. Вычистка идёт до записи, а не
 * при показе: иначе однажды она окажется забытой (CLAUDE.md, правило 7).
 * Поэтому здесь не «вычёркиваем секреты», а наоборот — записываем
 * только то, что разрешено списком ниже. Забытый список означает
 * пустую сводку, а не утёкший номер карты.
 */

import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import { OutboundError } from '@/shared/outbound'

export type ExchangeService = 'OXEN' | 'WALLET' | 'AML'

export interface ExchangeRecord {
  service: ExchangeService
  direction: 'OUT' | 'IN'
  /** Метод и путь для исходящих, `EVENT` и тип события для входящих. */
  method: string
  path: string
  operation: string
  subject?: string | undefined
  outcome: 'OK' | 'FAILED'
  httpStatus?: number | undefined
  requestId?: string | undefined
  durationMs: number
  errorCode?: string | undefined
  error?: string | undefined
  request?: Prisma.InputJsonValue | undefined
  response?: Prisma.InputJsonValue | undefined
}

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Записать обмен.
 *
 * Сбой записи не ломает саму операцию: журнал нужен для разбора,
 * и падение на логировании выпуска карты обошлось бы дороже, чем
 * пропущенная строка в журнале.
 */
export async function record(db: Db, entry: ExchangeRecord): Promise<void> {
  try {
    await db.exchangeLog.create({
      data: {
        service: entry.service,
        direction: entry.direction,
        method: entry.method,
        path: entry.path,
        operation: entry.operation,
        subject: entry.subject ?? null,
        outcome: entry.outcome,
        httpStatus: entry.httpStatus ?? null,
        requestId: entry.requestId ?? null,
        durationMs: entry.durationMs,
        errorCode: entry.errorCode ?? null,
        error: entry.error ?? null,
        ...(entry.request === undefined ? {} : { request: entry.request }),
        ...(entry.response === undefined ? {} : { response: entry.response }),
      },
    })
  } catch (error) {
    console.error('exchange-log', {
      service: entry.service,
      operation: entry.operation,
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}

/** Разобрать ошибку внешнего сервиса на поля журнала. */
export function describeFailure(error: unknown): {
  errorCode: string | undefined
  httpStatus: number | undefined
  requestId: string | undefined
  error: string
} {
  if (error instanceof OutboundError) {
    return {
      errorCode: error.code,
      httpStatus: error.httpStatus,
      requestId: error.requestId,
      error: error.message,
    }
  }
  return {
    errorCode: undefined,
    httpStatus: undefined,
    requestId: undefined,
    error: error instanceof Error ? error.message : String(error),
  }
}

/**
 * Догон событий.
 *
 * **Доставка вебхуков у эмитента одноразовая и без повторов.** Если
 * наш эндпоинт лежал минуту, события этой минуты потеряны навсегда —
 * кроме как через догон. Поэтому догон обязателен с первого дня,
 * а не «добавим потом»: без него мы просто не узнаем о части трат.
 *
 * Нюанс, на котором легко ошибиться: **непустой курсор означает
 * «запросить ещё раз», а не «есть ещё события»**. Признак того, что
 * догнали, — пустая страница с курсором `null`.
 *
 * Курсор живёт в базе, а не в памяти: перезапуск воркера не должен
 * начинать с начала времён, а пропущенное за время простоя надо
 * дочитать ровно с того места, где остановились.
 */

import type { PrismaClient } from '@/generated/prisma/client'
import type { OxenClient } from '../oxen'
import { applyEvent, type ApplyDeps } from './apply'
import { ingest, markFailed, markProcessed, pending } from './ingest'
import { redactForStorage } from './redact'

export const CURSOR_ID = 'oxen'

export interface CatchupResult {
  /** Сколько страниц прочитали. */
  pages: number
  /** Сколько событий увидели впервые. */
  stored: number
  /** Сколько применили. */
  applied: number
  /** Сколько не смогли применить — остались в очереди. */
  failed: number
  /** Дочитали до пустой страницы. */
  caughtUp: boolean
}

/**
 * Один проход догона.
 *
 * Читает страницы, пока не упрётся в пустую, затем разбирает очередь
 * необработанных событий. Ограничение по числу страниц нужно, чтобы
 * один проход не крутился вечно при большом отставании и воркер
 * успевал делать остальное.
 */
export async function catchUp(
  deps: ApplyDeps,
  options: { maxPages?: number } = {},
): Promise<CatchupResult> {
  const maxPages = options.maxPages ?? 20
  const result: CatchupResult = { pages: 0, stored: 0, applied: 0, failed: 0, caughtUp: false }

  let cursor = await readCursor(deps.prisma)

  try {
    while (result.pages < maxPages) {
      const page = await deps.oxen.listEvents(cursor)
      result.pages += 1

      for (const item of page.items) {
        const { stored } = await ingest(deps.prisma, {
          id: item.id,
          type: item.type,
          // Одноразовые коды в базу не попадают ни при каких условиях.
          data: redactForStorage(item.type, item.data),
        })
        if (stored) result.stored += 1
      }

      // Пустая страница с нулевым курсором — единственное
      // подтверждение того, что догнали.
      if (page.items.length === 0 && page.nextCursor === null) {
        result.caughtUp = true
        await markSynced(deps.prisma)
        break
      }

      // Позицию двигаем ТОЛЬКО на непустой курсор. Записать сюда
      // `null` значило бы потерять место и в следующий заход начать
      // читать с начала времён — а это сотни страниц и повторный
      // разбор всего, что уже разобрано.
      if (page.nextCursor !== null) {
        cursor = page.nextCursor
        await writeCursor(deps.prisma, cursor)
      }
    }
  } catch (error) {
    await writeError(deps.prisma, describe(error))
    throw error
  }

  const processed = await drainQueue(deps)
  result.applied = processed.applied
  result.failed = processed.failed
  return result
}

/**
 * Разобрать очередь необработанных событий.
 *
 * Отдельно от чтения страниц нарочно: событие могло прийти вебхуком
 * и не примениться из-за временной ошибки. Такое событие остаётся
 * в очереди и разбирается следующим заходом.
 *
 * Сбой на одном событии не останавливает остальные: иначе одно
 * незнакомое событие заблокировало бы всю очередь.
 */
export async function drainQueue(
  deps: ApplyDeps,
  take = 100,
): Promise<{ applied: number; failed: number }> {
  const queue = await pending(deps.prisma, take)
  let applied = 0
  let failed = 0

  for (const event of queue) {
    try {
      await applyEvent(deps, { id: event.id, type: event.type, data: event.data })
      await markProcessed(deps.prisma, event.id)
      applied += 1
    } catch (error) {
      await markFailed(deps.prisma, event.id, describe(error))
      failed += 1
    }
  }

  return { applied, failed }
}

/* --------------------------------------------------------------------------
   Отставание
   -------------------------------------------------------------------------- */

export interface CatchupStatus {
  cursor: string | null
  /** Когда догон последний раз дошёл до пустой страницы. */
  lastSyncedAt: Date | null
  /** Сколько секунд прошло с тех пор. Чем больше, тем сильнее мы
   *  отстаём: не читая страницы, мы не узнаём о тратах. */
  lagSeconds: number | null
  /** Событий в очереди. */
  unprocessed: number
  /** Самое старое необработанное. */
  oldestUnprocessedAt: Date | null
  /** Сколько из них уже падали при разборе. */
  failing: number
  lastError: string | null
}

/**
 * Индикатор отставания для «Состояния системы».
 *
 * Два разных отставания, и путать их нельзя. Первое — мы давно не
 * читали страницы: возможно, упал воркер. Второе — события приходят,
 * но не применяются: возможно, у нас ошибка в обработчике. Лечатся
 * они по-разному.
 */
export async function catchupStatus(prisma: PrismaClient, now = new Date()): Promise<CatchupStatus> {
  const row = await prisma.eventCursor.findUnique({ where: { id: CURSOR_ID } })
  const unprocessed = await prisma.oxenEvent.count({ where: { processedAt: null } })
  const failing = await prisma.oxenEvent.count({
    where: { processedAt: null, error: { not: null } },
  })
  const oldest = await prisma.oxenEvent.findFirst({
    where: { processedAt: null },
    orderBy: { receivedAt: 'asc' },
    select: { receivedAt: true },
  })

  const lastSyncedAt = row?.lastSyncedAt ?? null
  return {
    cursor: row?.cursor ?? null,
    lastSyncedAt,
    lagSeconds:
      lastSyncedAt === null ? null : Math.floor((now.getTime() - lastSyncedAt.getTime()) / 1000),
    unprocessed,
    oldestUnprocessedAt: oldest?.receivedAt ?? null,
    failing,
    lastError: row?.lastError ?? null,
  }
}

/* -------------------------------------------------------------------------- */

async function readCursor(prisma: PrismaClient): Promise<string | null> {
  const row = await prisma.eventCursor.findUnique({ where: { id: CURSOR_ID } })
  return row?.cursor ?? null
}

async function writeCursor(prisma: PrismaClient, cursor: string | null): Promise<void> {
  await prisma.eventCursor.upsert({
    where: { id: CURSOR_ID },
    create: { id: CURSOR_ID, cursor },
    update: { cursor, lastError: null },
  })
}

async function markSynced(prisma: PrismaClient): Promise<void> {
  // Именно upsert: на пустой базе первый же проход упирается в пустую
  // страницу, строки курсора ещё нет, и `update` бросил бы ошибку —
  // догон падал бы ровно там, где всё в порядке.
  await prisma.eventCursor.upsert({
    where: { id: CURSOR_ID },
    create: { id: CURSOR_ID, lastSyncedAt: new Date() },
    update: { lastSyncedAt: new Date(), lastError: null },
  })
}

async function writeError(prisma: PrismaClient, error: string): Promise<void> {
  await prisma.eventCursor.upsert({
    where: { id: CURSOR_ID },
    create: { id: CURSOR_ID, lastError: error },
    update: { lastError: error },
  })
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export type { OxenClient }

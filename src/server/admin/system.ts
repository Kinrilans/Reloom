/**
 * Состояние системы: технический экран для разбора проблем.
 *
 * Главное требование к нему — у каждой строки должен быть **переход
 * к самой проблеме**. Список проблем без перехода заставляет искать
 * их руками и этим обесценивает себя. Поэтому здесь отдаются не
 * только числа, но и то, по чему проблему найдут: идентификатор
 * пользователя, `requestId`, идентификатор события.
 *
 * Ключей доступа на этом экране нет и не будет: они живут
 * в переменных окружения (CLAUDE.md, правило 7). Оператору нужно
 * знать, отвечает сервис или нет, а не чем мы к нему подключаемся.
 */

import type { PrismaClient } from '@/generated/prisma/client'
import { formatMinor } from '@/shared/money'
import { catchupStatus } from '../events'

export interface ServiceHealth {
  /** Код сервиса в терминах интерфейса: `oxen`, `addresses`, `aml`. */
  code: 'oxen' | 'addresses' | 'aml'
  /** Куда ходим. В режиме заглушки — так и написано. */
  host: string
  ok: boolean
  /** Когда последний раз отвечал. `null` — не обращались ни разу. */
  lastAt: string | null
  lastError: string | null
}

export interface StuckCall {
  key: string
  /** Что отправляли: сервис и операция. */
  action: string
  subjectType: string
  subjectId: string
  requestId: string | null
  at: string
}

export interface SystemView {
  eventLagSeconds: number | null
  unprocessedEvents: number
  failingEvents: number
  oldestUnprocessedAt: string | null
  catchupError: string | null
  lastPoolRead: string | null
  /** Признак троттлинга: серия отказов `UNAUTHORIZED`, который
   *  у эмитента неотличим от превышения общего бюджета запросов. */
  throttling: boolean
  pendingTransfers: {
    id: string
    userId: string
    userName: string
    amount: string
    status: string
    at: string
  }[]
  stuckCalls: StuckCall[]
  errors: {
    id: string
    service: string
    code: string
    requestId: string | null
    error: string | null
    at: string
  }[]
  services: ServiceHealth[]
}

/** Сколько ждать ответа, прежде чем считать вызов зависшим. */
const STUCK_AFTER_MS = 2 * 60 * 1000

export async function systemView(
  prisma: PrismaClient,
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): Promise<SystemView> {
  const catchup = await catchupStatus(prisma, now)

  const transfers = await prisma.cardTransfer.findMany({
    where: { status: { in: ['PENDING', 'SOURCE_REDUCED'] } },
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })

  // Намерение, которое ушло и не получило ответа. Именно оно означает
  // «может быть, карта уже выпущена»: повторять такой вызов нельзя,
  // состояние выясняется чтением (CLAUDE.md, правило 8).
  const stuck = await prisma.outboundIntent.findMany({
    where: { status: 'SENT', updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
    orderBy: { updatedAt: 'asc' },
    take: 50,
  })

  const errors = await prisma.exchangeLog.findMany({
    where: { outcome: 'FAILED' },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  const lastPoolRead = await prisma.company.aggregate({ _max: { poolReadAt: true } })

  return {
    eventLagSeconds: catchup.lagSeconds,
    unprocessedEvents: catchup.unprocessed,
    failingEvents: catchup.failing,
    oldestUnprocessedAt: catchup.oldestUnprocessedAt?.toISOString() ?? null,
    catchupError: catchup.lastError,
    lastPoolRead: lastPoolRead._max.poolReadAt?.toISOString() ?? null,
    throttling: await isThrottled(prisma, now),
    pendingTransfers: transfers.map((transfer) => ({
      id: transfer.id,
      userId: transfer.userId,
      userName: transfer.user.fullName,
      amount: formatMinor(transfer.amountMinor),
      status: transfer.status,
      at: transfer.createdAt.toISOString(),
    })),
    stuckCalls: stuck.map((intent) => ({
      key: intent.key,
      action: `${intent.service} ${intent.operation}`,
      subjectType: intent.subjectType,
      subjectId: intent.subjectId,
      requestId: intent.requestId,
      at: intent.updatedAt.toISOString(),
    })),
    errors: errors.map((row) => ({
      id: row.id,
      service: row.service,
      code: [row.httpStatus, row.errorCode].filter(Boolean).join(' ') || 'FAILED',
      requestId: row.requestId,
      error: row.error,
      at: row.createdAt.toISOString(),
    })),
    services: await servicesHealth(prisma, env),
  }
}

/**
 * Серия `401` от эмитента.
 *
 * У них этот код неотличим от превышения общего бюджета запросов,
 * который делят все партнёры. Поэтому несколько таких отказов подряд
 * означают не «ключ неверен», а «нас придерживают», и очередь уходит
 * в медленный режим.
 */
async function isThrottled(prisma: PrismaClient, now: Date): Promise<boolean> {
  const recent = await prisma.exchangeLog.count({
    where: {
      service: 'OXEN',
      errorCode: 'UNAUTHORIZED',
      createdAt: { gte: new Date(now.getTime() - 5 * 60 * 1000) },
    },
  })
  return recent >= 3
}

/**
 * Отвечают ли внешние сервисы.
 *
 * Считается по журналу обмена: отдельных проверок доступности мы не
 * делаем. Специальный «пинг» показывал бы, что сервис отвечает на
 * пинг, — а знать надо, проходят ли наши настоящие вызовы.
 */
async function servicesHealth(
  prisma: PrismaClient,
  env: Record<string, string | undefined>,
): Promise<ServiceHealth[]> {
  const map = [
    { service: 'OXEN', code: 'oxen' as const, mode: env.OXEN_MODE, url: env.OXEN_BASE_URL },
    { service: 'WALLET', code: 'addresses' as const, mode: env.WALLET_MODE, url: env.WALLET_BASE_URL },
    { service: 'AML', code: 'aml' as const, mode: env.AML_MODE, url: env.AML_BASE_URL },
  ]

  const health: ServiceHealth[] = []
  for (const item of map) {
    const last = await prisma.exchangeLog.findFirst({
      where: { service: item.service, direction: 'OUT' },
      orderBy: { createdAt: 'desc' },
    })
    health.push({
      code: item.code,
      host: (item.mode ?? 'mock') === 'mock' ? 'mock' : hostOf(item.url),
      // Пока вызовов не было, считаем, что всё в порядке: «не
      // обращались» и «не отвечает» — разные вещи, и красный значок
      // на пустом журнале гонял бы оператора искать несуществующую
      // поломку.
      ok: last === null || last.outcome === 'OK',
      lastAt: last?.createdAt.toISOString() ?? null,
      lastError: last?.outcome === 'FAILED' ? (last.error ?? last.errorCode ?? null) : null,
    })
  }
  return health
}

function hostOf(url: string | undefined): string {
  if (!url) return '—'
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

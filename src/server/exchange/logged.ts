/**
 * Обёртка адаптера, пишущая каждый вызов в журнал обмена.
 *
 * Оборачивается именно адаптер, а не HTTP-клиент: на моке HTTP нет,
 * и журнал оказался бы пуст в режиме разработки (см. `index.ts`).
 *
 * Что записывается в сводку, решает **список разрешённых операций**
 * ниже. Операция, которой в списке нет, попадает в журнал без сводки:
 * забытый список означает пустую строку, а не утёкший номер карты.
 * Поэтому `createSecretsSession` в списке отсутствует намеренно — через
 * неё проходит шифротекст реквизитов, и ни запрос, ни ответ по ней
 * не записываются никогда (CLAUDE.md, правило 7).
 */

import type { PrismaClient } from '@/generated/prisma/client'
import { describeFailure, record, type ExchangeService } from './index'

interface Route {
  method: string
  path: string
}

/**
 * Маршруты для показа. Пути те же, что в живом клиенте
 * (`src/server/oxen/live.ts`), но с подстановкой `:id` вместо
 * настоящего идентификатора: он и так стоит в колонке «предмет».
 */
const ROUTES: Record<ExchangeService, Record<string, Route>> = {
  OXEN: {
    getFunding: { method: 'GET', path: '/clients/:id/funding' },
    getClient: { method: 'GET', path: '/clients/:id' },
    createCardholder: { method: 'POST', path: '/clients/:id/cardholders' },
    getCardholder: { method: 'GET', path: '/cardholders/:id' },
    issueCard: { method: 'POST', path: '/cardholders/:id/cards' },
    getCard: { method: 'GET', path: '/cards/:id' },
    setCardLimit: { method: 'PUT', path: '/cards/:id/limit' },
    freezeCard: { method: 'POST', path: '/cards/:id/freeze' },
    unfreezeCard: { method: 'POST', path: '/cards/:id/unfreeze' },
    cancelCard: { method: 'POST', path: '/cards/:id/cancel' },
    getTransaction: { method: 'GET', path: '/transactions/:id' },
    listEvents: { method: 'GET', path: '/events' },
    createSecretsSession: { method: 'POST', path: '/cards/:id/secrets' },
  },
  WALLET: {
    listAssets: { method: 'GET', path: '/assets' },
    createAddress: { method: 'POST', path: '/addresses' },
    getIncoming: { method: 'GET', path: '/incoming/:id' },
    listIncoming: { method: 'GET', path: '/incoming' },
    sendRefund: { method: 'POST', path: '/refunds' },
    getRefund: { method: 'GET', path: '/refunds/:id' },
  },
  AML: {
    screen: { method: 'POST', path: '/screen' },
  },
}

/**
 * Операции, у которых сводку записывать разрешено.
 *
 * Через них не проходят реквизиты карт, ключи и одноразовые коды —
 * только идентификаторы, суммы и вердикты. Всё, чего в списке нет,
 * пишется без сводки.
 */
const SUMMARIZED: Record<ExchangeService, Set<string>> = {
  OXEN: new Set([
    'getFunding',
    'getClient',
    'createCardholder',
    'getCardholder',
    'issueCard',
    'getCard',
    'setCardLimit',
    'freezeCard',
    'unfreezeCard',
    'cancelCard',
    'getTransaction',
    'listEvents',
  ]),
  WALLET: new Set(['listAssets', 'createAddress', 'getIncoming', 'listIncoming', 'sendRefund', 'getRefund']),
  AML: new Set(['screen']),
}

export interface LoggedOptions {
  prisma: PrismaClient
  service: ExchangeService
  /** Выключается в тестах домена, где журнал только мешает. */
  enabled?: boolean
}

/**
 * Обернуть клиента так, чтобы каждый его вызов попадал в журнал.
 *
 * Прокси, а не двенадцать написанных руками методов: интерфейс
 * эмитента менялся ломающими изменениями еженедельно, и обёртка,
 * перечисляющая методы, ломалась бы вместе с ним — молча, пропав из
 * журнала.
 */
export function logged<T extends object>(client: T, options: LoggedOptions): T {
  if (options.enabled === false) return client
  const routes = ROUTES[options.service]
  const summarized = SUMMARIZED[options.service]

  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown
      if (typeof value !== 'function' || typeof property !== 'string') return value

      return async (...args: unknown[]) => {
        const started = Date.now()
        try {
          const result = await (value as (...a: unknown[]) => unknown).apply(target, args)
          // Запись дожидается завершения нарочно. Вызов наружу идёт
          // десятки миллисекунд, вставка строки — доли, а незаписанная
          // запись журнала означает разбор по чужому логу. Заодно
          // порядок строк в журнале совпадает с порядком вызовов.
          await write(options, property, args, result, undefined, Date.now() - started)
          return result
        } catch (error) {
          await write(options, property, args, undefined, error, Date.now() - started)
          throw error
        }
      }

      function write(
        opts: LoggedOptions,
        operation: string,
        callArgs: unknown[],
        resolved: unknown,
        error: unknown,
        durationMs: number,
      ): Promise<void> {
        const route = routes[operation] ?? { method: 'CALL', path: operation }
        const maySummarize = summarized.has(operation)
        const failure = error === undefined ? undefined : describeFailure(error)

        return record(opts.prisma, {
          service: opts.service,
          direction: 'OUT',
          method: route.method,
          path: route.path,
          operation,
          subject: subjectOf(callArgs),
          outcome: failure ? 'FAILED' : 'OK',
          httpStatus: failure?.httpStatus,
          requestId: failure?.requestId,
          durationMs,
          errorCode: failure?.errorCode,
          error: failure?.error,
          request: maySummarize ? plain(callArgs) : undefined,
          response: maySummarize && !failure ? plain(resolved) : undefined,
        })
      }
    },
  })
}

/** Предмет вызова: первый аргумент-строка. Это всегда идентификатор. */
function subjectOf(args: unknown[]): string | undefined {
  const first = args[0]
  return typeof first === 'string' ? first : undefined
}

/**
 * Привести к виду, который переживёт запись в JSON.
 *
 * Суммы у нас `bigint`, и `JSON.stringify` на нём бросает. Они
 * становятся строками, а не числами: число с плавающей точкой над
 * деньгами запрещено даже в записи для человека.
 *
 * Большие ответы режутся: страница событий догона — это сотни
 * записей, и журнал обмена не должен превращаться во вторую их копию.
 */
function plain(value: unknown): ReturnType<typeof JSON.parse> | undefined {
  if (value === undefined) return undefined
  const text = JSON.stringify(value, (_key, inner: unknown) =>
    typeof inner === 'bigint' ? inner.toString() : inner,
  )
  if (text === undefined) return undefined
  if (text.length > 4000) return { truncated: true, size: text.length }
  return JSON.parse(text)
}

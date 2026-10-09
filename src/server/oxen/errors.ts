/**
 * Таксономия ошибок эмитента и правила повтора.
 *
 * Механика повторов и троттлинга общая на все три внешних сервиса
 * и лежит в `src/shared/outbound.ts`. Здесь — только то, что у этого
 * сервиса своё: его коды и решение, какие из них повторяемы.
 *
 * Главное правило, и оно противоречит привычке: **у Oxen нет правила
 * «5xx можно повторить»**. Повторять можно только те коды, которые
 * явно разрешены ниже. Неизвестный код, включая любой 5xx, повторять
 * нельзя (CLAUDE.md, правило 8).
 *
 * Цена ошибки несимметрична. Не повторили то, что можно было, — лишний
 * ручной разбор. Повторили то, что было нельзя, — вторая выпущенная
 * карта, то есть потерянные деньги.
 */

import {
  OutboundError,
  retryDelayMs,
  type OperationKind,
  type OutboundErrorInit,
  type Recovery,
} from '@/shared/outbound'

export type { OperationKind, Recovery }
export { retryDelayMs }

export class OxenError extends OutboundError {
  constructor(init: OutboundErrorInit) {
    super(init)
    this.name = 'OxenError'
  }
}

/**
 * Коды, названные в документации. Список открытый: прийти может что
 * угодно, и всё неизвестное попадает под `STOP`.
 */
export const KNOWN_CODES = {
  /** Карта, возможно, выпущена, но эмитент её не записал. Повтор
   *  выпустит вторую — не повторять НИКОГДА. */
  CARD_UNRECORDED: 'CARD_UNRECORDED',
  /** Эмитент не знает, применилась ли операция. На изменяющих вызовах
   *  повтор того же запроса безопасен, на создающих — нет. */
  PROVIDER_AMBIGUOUS: 'PROVIDER_AMBIGUOUS',
  /** Лимит этой карты уже меняется. Лучше не допускать вовсе:
   *  у себя стоит блокировка на карту. */
  LIMIT_UPDATE_IN_PROGRESS: 'LIMIT_UPDATE_IN_PROGRESS',
  /** Общий на платформу рейт-лимит. Ждать `retryAfterSeconds`. */
  PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
  /** Исчерпан бюджет просмотров реквизитов конкретной карты. */
  REVEAL_RATE_LIMITED: 'REVEAL_RATE_LIMITED',
  /** Операция над отменённой картой. Отмена необратима. */
  CARD_TERMINAL: 'CARD_TERMINAL',
  /** Не хватило залога компании. Проверяется РАНЬШЕ лимита карты,
   *  поэтому про остаток карты этот отказ не говорит ничего. */
  ACCOUNT_CREDIT_LIMIT_EXCEEDED: 'account_credit_limit_exceeded',
  /** Ключ неверен ЛИБО сработал общий троттлинг — различить нельзя. */
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const

/**
 * `401` у них неотличим от превышения общего бюджета запросов: он
 * считается по IP и по бюджету, который делят все партнёры. Поэтому
 * такой ответ не повторяется и переводит очередь в медленный режим.
 */
export function isThrottleSignal(error: OutboundError): boolean {
  return error.code === KNOWN_CODES.UNAUTHORIZED
}

/**
 * Что делать после отказа.
 *
 * Единственное место, где принимается это решение. Разбросанный по
 * вызовам `if (status >= 500) retry` — то, ради предотвращения чего
 * функция и существует.
 */
export function recoveryFor(error: OutboundError, kind: OperationKind): Recovery {
  switch (error.code) {
    case KNOWN_CODES.CARD_UNRECORDED:
      // Повтор выпустит вторую карту. Разбирается только человеком.
      return 'STOP'

    case KNOWN_CODES.PROVIDER_AMBIGUOUS:
      // На изменяющем вызове повтор безопасен: лимит выставляется
      // абсолютным значением, заморозка идемпотентна по смыслу.
      // На создающем — перечитать: вдруг ресурс уже создан.
      return kind === 'CREATE' ? 'REREAD' : 'RETRY'

    case KNOWN_CODES.LIMIT_UPDATE_IN_PROGRESS:
      return 'RETRY'

    case KNOWN_CODES.PROVIDER_RATE_LIMITED:
      return 'RETRY'

    case KNOWN_CODES.UNAUTHORIZED:
      return 'STOP'

    case KNOWN_CODES.CARD_TERMINAL:
    case KNOWN_CODES.ACCOUNT_CREDIT_LIMIT_EXCEEDED:
      // Отказы по существу: повтор ничего не изменит.
      return 'STOP'

    default:
      // Неизвестный код, включая любой 5xx. Если ресурс можно
      // перечитать — читаем, иначе останавливаемся.
      return kind === 'READ' ? 'STOP' : 'REREAD'
  }
}

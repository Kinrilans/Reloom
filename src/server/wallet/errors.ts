/**
 * Ошибки сервиса крипто-адресов и правила повтора.
 *
 * Механика повторов общая на все внешние сервисы
 * (`src/shared/outbound.ts`); здесь — решение, что считать повторяемым
 * именно тут. И оно жёстче, чем у эмитента, по одной причине: этим
 * сервисом **отправляют деньги**.
 *
 * Их коды ошибок не задокументированы. Поэтому правило построено не на
 * кодах, а на роде операции и на том, что про ответ известно наверняка.
 * Угадывать, какой чужой код безопасно повторить, нельзя: ошибка стоит
 * второй отправки средств.
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

export class WalletError extends OutboundError {
  constructor(init: OutboundErrorInit) {
    super(init)
    this.name = 'WalletError'
  }
}

/**
 * Коды, которые синтезируем мы сами.
 *
 * Их собственные коды придут в поле `code` тела ответа и пройдут
 * насквозь; на решение о повторе они не влияют, потому что мы не
 * знаем, что они значат.
 */
export const CODES = {
  /** Соединение не состоялось или оборвалось. Про состояние на их
   *  стороне не известно ничего. */
  NETWORK: 'NETWORK',
  /** Слишком часто. Ждать `retryAfterSeconds`, если прислали. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** Ключ не принят. Это наша конфигурация, а не их недоступность. */
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const

export function isThrottleSignal(error: OutboundError): boolean {
  return error.code === CODES.RATE_LIMITED
}

/**
 * Что делать после отказа.
 *
 * **Создающие вызовы не повторяются никогда.** К ним относится и
 * выдача адреса, и — главное — отправка возврата. Про неоднозначный
 * ответ на отправку мы не знаем, ушли деньги или нет; повтор во втором
 * случае отправит их дважды, и вернуть их будет неоткуда. Состояние
 * выясняется **чтением**, и только им.
 *
 * Идемпотентен ли их вызов отправки и по какому ключу — открытый
 * вопрос (`docs/crypto-integration.md`). Пока ответа нет, считаем, что
 * не идемпотентен: ошибиться в эту сторону стоит ручного разбора,
 * в другую — чужих денег.
 */
export function recoveryFor(error: OutboundError, kind: OperationKind): Recovery {
  if (kind === 'CREATE') return 'REREAD'

  switch (error.code) {
    case CODES.RATE_LIMITED:
      return 'RETRY'
    case CODES.NETWORK:
      // Чтение и изменение повторить безопасно: ни то, ни другое денег
      // не двигает.
      return 'RETRY'
    case CODES.UNAUTHORIZED:
      return 'STOP'
    default:
      return kind === 'READ' ? 'STOP' : 'REREAD'
  }
}

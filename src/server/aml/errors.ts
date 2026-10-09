/**
 * Ошибки сервиса проверки происхождения и правила повтора.
 *
 * Сервис только читает публичные данные блокчейна: денег он не
 * двигает, и повтор чтения безвреден. Поэтому правила здесь мягче,
 * чем у кошелька, — но «неизвестный код не повторяем» остаётся.
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

export class AmlError extends OutboundError {
  constructor(init: OutboundErrorInit) {
    super(init)
    this.name = 'AmlError'
  }
}

export const CODES = {
  NETWORK: 'NETWORK',
  RATE_LIMITED: 'RATE_LIMITED',
  /** Ключ не принят. Это наша конфигурация, а не их недоступность:
   *  наружу уходит исключением, а не вердиктом «не ответил». */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** Сервис ответил отказом по существу запроса. */
  BAD_REQUEST: 'BAD_REQUEST',
} as const

/** Недоступность: это штатный исход проверки, а не поломка у нас. */
export function isUnavailable(error: OutboundError): boolean {
  return (
    error.code === CODES.NETWORK ||
    error.code === CODES.RATE_LIMITED ||
    error.httpStatus >= 500
  )
}

export function recoveryFor(error: OutboundError, _kind: OperationKind): Recovery {
  switch (error.code) {
    case CODES.RATE_LIMITED:
    case CODES.NETWORK:
      return 'RETRY'
    default:
      return 'STOP'
  }
}

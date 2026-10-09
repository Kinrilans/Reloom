/**
 * Адаптер эмитента: единственная точка контакта с Oxen.
 *
 * Из бизнес-логики прямых HTTP-вызовов нет и быть не должно. Их
 * контракт менялся ломающими изменениями четыре раза за месяц уже
 * после того, как был объявлен финализированным, — адаптер наш
 * единственный буфер (CLAUDE.md, «Конвенции»).
 */

export { OxenError, recoveryFor, retryDelayMs, isThrottleSignal, KNOWN_CODES } from './errors'
export type { OperationKind, Recovery } from './errors'

export { OxenHttp } from './http'
export type { HttpConfig, RequestOptions } from './http'

export { Throttle, DEFAULT_THROTTLE, OutboundError } from '@/shared/outbound'
export type { ThrottleOptions } from '@/shared/outbound'

export { LiveOxenClient, isCardholderApproved } from './live'
export { retrying } from './retrying'
export { runWithRecovery } from './recovery'
export type { RecoveryOptions } from './recovery'
export { MockOxenClient } from './mock'
export type { MockOperation } from './mock'

export { cardStatusFromEvent, UNVERIFIED } from './schemas'
export type { OxenCardStatus } from './schemas'

export type {
  Intent,
  OxenCard,
  OxenCardholder,
  OxenClient,
  OxenClientInfo,
  OxenEventItem,
  OxenEventPage,
  OxenFunding,
  OxenSecrets,
  OxenTransaction,
} from './types'

import { OxenHttp } from './http'
import { LiveOxenClient } from './live'
import { MockOxenClient } from './mock'
import { retrying } from './retrying'
import type { OxenClient } from './types'

export type OxenMode = 'mock' | 'sandbox' | 'production'

export class OxenConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OxenConfigError'
  }
}

/**
 * Собрать клиента по переменным окружения.
 *
 * Режим задаётся `OXEN_MODE`. Значение по умолчанию — `mock`: до
 * получения доступа к их API работаем против заглушки, и это штатный
 * режим разработки, а не временная мера.
 *
 * Неизвестный режим — ошибка, а не молчаливый откат к заглушке:
 * опечатка в `OXEN_PRODUCTION` не должна оборачиваться тем, что
 * продакшн тихо работает на моке.
 */
export function createOxenClient(
  env: Record<string, string | undefined> = process.env,
): OxenClient {
  const mode = (env.OXEN_MODE ?? 'mock') as OxenMode

  // Заглушка оборачивается теми же правилами повтора, что действуют
  // в HTTP-клиенте. Иначе код, проверенный против неё, увидел бы
  // ошибки, которые на песочнице были бы повторены и исчезли.
  if (mode === 'mock') return retrying(new MockOxenClient())

  if (mode !== 'sandbox' && mode !== 'production') {
    throw new OxenConfigError(`Неизвестный OXEN_MODE: «${String(env.OXEN_MODE)}»`)
  }

  const baseUrl = env.OXEN_BASE_URL
  const apiKey = env.OXEN_API_KEY
  if (!baseUrl || !apiKey) {
    throw new OxenConfigError(
      'Для режима ' + mode + ' нужны OXEN_BASE_URL и OXEN_API_KEY (см. .env.example)',
    )
  }

  return new LiveOxenClient(new OxenHttp({ baseUrl, apiKey, maxRetries: 3 }))
}

/**
 * Адаптер сервиса крипто-адресов: единственная точка контакта
 * с `new.cryptocurrencyapi.net`.
 *
 * Из бизнес-логики прямых HTTP-вызовов нет (CLAUDE.md, «Конвенции»).
 * Ключ этого сервиса опаснее остальных: им отправляют деньги с
 * адресов. Он живёт только в переменных окружения и в админку не
 * выводится ни в каком виде (`docs/security.md`).
 */

export { WalletError, recoveryFor, isThrottleSignal, retryDelayMs, CODES } from './errors'
export { WalletHttp } from './http'
export type { WalletHttpConfig, WalletRequest } from './http'
export { LiveWalletClient } from './live'
export { MockWalletClient } from './mock'
export type { WalletOperation } from './mock'
export { retrying } from './retrying'
export { runWithRecovery } from './recovery'
export type { RecoveryOptions } from './recovery'
export { UNVERIFIED } from './schemas'
export type {
  IncomingPage,
  IncomingTransfer,
  Intent,
  Refund,
  RefundStatus,
  WalletAddress,
  WalletAsset,
  WalletClient,
} from './types'

import { WalletHttp } from './http'
import { LiveWalletClient } from './live'
import { MockWalletClient } from './mock'
import { retrying } from './retrying'
import type { WalletClient } from './types'

export type WalletMode = 'mock' | 'live'

export class WalletConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WalletConfigError'
  }
}

/**
 * Собрать клиента по переменным окружения.
 *
 * По умолчанию заглушка: доступа к их API пока нет, и это штатный
 * режим разработки. Неизвестный режим — ошибка, а не молчаливый откат
 * к заглушке: иначе опечатка обернётся тем, что продакшн тихо работает
 * на моке и никому не отправляет денег.
 */
export function createWalletClient(
  env: Record<string, string | undefined> = process.env,
): WalletClient {
  const mode = env.WALLET_MODE ?? 'mock'

  if (mode === 'mock') return retrying(new MockWalletClient())

  if (mode !== 'live') {
    throw new WalletConfigError(`Неизвестный WALLET_MODE: «${String(env.WALLET_MODE)}»`)
  }

  const baseUrl = env.WALLET_BASE_URL
  const apiKey = env.WALLET_API_KEY
  if (!baseUrl || !apiKey) {
    throw new WalletConfigError('Нужны WALLET_BASE_URL и WALLET_API_KEY (см. .env.example)')
  }

  return new LiveWalletClient(new WalletHttp({ baseUrl, apiKey }))
}

/**
 * Адаптер проверки происхождения средств: единственная точка контакта
 * с `getblock.net`.
 *
 * Оценку риска мы не считаем — она приходит готовой, и всё, что мы
 * с ней делаем, это сравниваем с порогом из настроек админки.
 */

export { AmlError, recoveryFor, isUnavailable, retryDelayMs, CODES } from './errors'
export { LiveAmlClient } from './live'
export type { AmlHttpConfig } from './live'
export { MockAmlClient } from './mock'
export { UNVERIFIED } from './schemas'
export type { AmlClient, AmlRequest, AmlScreening, AmlVerdict } from './types'

import { LiveAmlClient } from './live'
import { MockAmlClient } from './mock'
import type { AmlClient } from './types'

export class AmlConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AmlConfigError'
  }
}

/**
 * Собрать клиента по переменным окружения.
 *
 * Порог риска приходит из настроек админки, а не из окружения: это
 * решение владельца, которое меняется в интерфейсе и попадает в аудит.
 */
export function createAmlClient(
  maxRisk: number,
  env: Record<string, string | undefined> = process.env,
): AmlClient {
  const mode = env.AML_MODE ?? 'mock'

  if (mode === 'mock') return new MockAmlClient(maxRisk)

  if (mode !== 'live') {
    throw new AmlConfigError(`Неизвестный AML_MODE: «${String(env.AML_MODE)}»`)
  }

  const baseUrl = env.AML_BASE_URL
  const apiKey = env.AML_API_KEY
  if (!baseUrl || !apiKey) {
    throw new AmlConfigError('Нужны AML_BASE_URL и AML_API_KEY (см. .env.example)')
  }

  return new LiveAmlClient({ baseUrl, apiKey, maxRisk })
}

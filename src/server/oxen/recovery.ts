/**
 * Повтор по allow-list для вызовов эмитента.
 *
 * Сам цикл общий на все внешние сервисы (`src/shared/outbound.ts`),
 * здесь к нему подставляются правила именно этого сервиса. Вынесено
 * отдельно, чтобы правила не оказались в двух местах — в HTTP-клиенте
 * и в заглушке: два места означают две разные реализации через
 * полгода, и код, проверенный на заглушке, повёл бы себя на живом API
 * иначе.
 */

import { runWithRecovery as runShared, type OperationKind } from '@/shared/outbound'
import { isThrottleSignal, recoveryFor } from './errors'

export interface RecoveryOptions {
  maxRetries: number
  sleep: (ms: number) => Promise<void>
  /** Вызывается на `401`: очередь переходит в медленный режим. */
  onUnauthorized?: () => void
}

export async function runWithRecovery<T>(
  kind: OperationKind,
  attempt: () => Promise<T>,
  options: RecoveryOptions,
): Promise<T> {
  return runShared(kind, attempt, {
    maxRetries: options.maxRetries,
    sleep: options.sleep,
    decide: recoveryFor,
    isThrottleSignal,
    ...(options.onUnauthorized ? { onThrottleSignal: options.onUnauthorized } : {}),
  })
}

/**
 * Повтор по allow-list для вызовов сервиса крипто-адресов.
 *
 * Цикл общий на все внешние сервисы, правила — свои. Главное из них:
 * создающие вызовы не повторяются никогда, потому что одним из них
 * отправляются деньги.
 */

import { runWithRecovery as runShared, type OperationKind } from '@/shared/outbound'
import { isThrottleSignal, recoveryFor } from './errors'

export interface RecoveryOptions {
  maxRetries: number
  sleep: (ms: number) => Promise<void>
  /** Вызывается на «слишком часто»: очередь замедляется. */
  onRateLimited?: () => void
}

export async function runWithRecovery<T>(
  kind: OperationKind,
  attempt: () => Promise<T>,
  options: RecoveryOptions,
): Promise<T> {
  return runShared(kind, attempt, {
    maxRetries: options.maxRetries,
    sleep: options.sleep,
    // «Слишком часто» здесь и повторяется, и замедляет очередь —
    // в отличие от эмитента, где такой ответ означает «остановиться
    // и позвать человека». Поэтому сигнал подаётся прямо отсюда,
    // а не через `isThrottleSignal`: тот останавливает цикл.
    decide: (error, operation) => {
      if (isThrottleSignal(error)) options.onRateLimited?.()
      return recoveryFor(error, operation)
    },
  })
}

export { isThrottleSignal }

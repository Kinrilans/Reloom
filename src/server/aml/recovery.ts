/**
 * Повтор для вызовов проверки происхождения.
 *
 * Цикл общий на все внешние сервисы, правила — свои. Проверка только
 * читает, поэтому повтор безвреден; исчерпав попытки, адаптер отдаёт
 * вердикт «сервис не ответил», а не исключение.
 */

import { runWithRecovery as runShared, type OperationKind } from '@/shared/outbound'
import { recoveryFor } from './errors'

export interface RecoveryOptions {
  maxRetries: number
  sleep: (ms: number) => Promise<void>
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
  })
}

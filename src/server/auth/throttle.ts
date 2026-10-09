/**
 * Ограничение попыток входа.
 *
 * Счётчик живёт **в памяти процесса**, и это осознанное ограничение:
 * при нескольких экземплярах приложения лимит действует на каждый
 * отдельно, а перезапуск его сбрасывает. Записывать попытки в базу
 * значило бы дать любому желающему способ запирать операторов —
 * достаточно подбирать пароль чужой почте.
 *
 * Задача здесь не «остановить атаку», а «сделать перебор
 * бессмысленно медленным». Для внутренней админки за парой тысяч
 * попыток в сутки этого достаточно; дальше защита — длина пароля и
 * второй фактор.
 */

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export interface ThrottleVerdict {
  allowed: boolean
  /** Сколько секунд ждать. Показывается человеку. */
  retryAfterSeconds: number
}

export function noteAttempt(key: string, now = Date.now()): ThrottleVerdict {
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  bucket.count += 1
  if (bucket.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  return { allowed: true, retryAfterSeconds: 0 }
}

/** Удачный вход обнуляет счётчик: лимит против перебора, а не против
 *  человека, который с третьей попытки вспомнил пароль. */
export function noteSuccess(key: string): void {
  buckets.delete(key)
}

/** Только для тестов: вернуть счётчики в исходное состояние. */
export function resetThrottle(): void {
  buckets.clear()
}

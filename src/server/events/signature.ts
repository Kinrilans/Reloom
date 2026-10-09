/**
 * Проверка подписи вебхука.
 *
 * Порядок обязателен и нарушать его нельзя:
 *
 * 1. Взять **сырые байты** тела, до разбора JSON.
 * 2. Прочитать идентификатор события из заголовка.
 * 3. Проверить HMAC по сырым байтам.
 * 4. Только после этого парсить.
 *
 * Причина в том, что подпись считается по байтам, а не по смыслу.
 * Любой разбор и повторная сборка JSON меняют пробелы и порядок
 * ключей — подпись перестаёт сходиться, и начинается «починка»
 * сравнением полей, то есть отказ от проверки вовсе.
 *
 * Сравнение постоянного времени тоже не формальность: обычное
 * посимвольное сравнение выдаёт по времени, сколько первых символов
 * подписи угаданы, и подпись подбирается байт за байтом.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Заголовок с идентификатором события — задокументирован. */
export const EVENT_ID_HEADER = 'x-oxen-event-id'

/**
 * Заголовок с подписью.
 *
 * Название в документации не указано — см. `UNVERIFIED`. Вынесено
 * в константу, чтобы при подключении правка была в одном месте,
 * а не поиском по проекту.
 */
export const SIGNATURE_HEADER = 'x-oxen-signature'

export type SignatureResult =
  | { ok: true; eventId: string }
  | { ok: false; reason: 'NO_EVENT_ID' | 'NO_SIGNATURE' | 'BAD_SIGNATURE' }

export function sign(rawBody: Uint8Array | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

/**
 * Проверить подпись и достать идентификатор события.
 *
 * Отсутствие заголовков — такой же отказ, как неверная подпись:
 * неподписанный вебхук не обрабатывается. Принять его «потому что
 * подписи почему-то нет» означает открыть эндпоинт всем.
 */
export function verifyWebhook(
  rawBody: Uint8Array | string,
  headers: { get(name: string): string | null },
  secret: string,
): SignatureResult {
  const eventId = headers.get(EVENT_ID_HEADER)
  if (!eventId) return { ok: false, reason: 'NO_EVENT_ID' }

  const provided = headers.get(SIGNATURE_HEADER)
  if (!provided) return { ok: false, reason: 'NO_SIGNATURE' }

  const expected = sign(rawBody, secret)
  if (!equalsConstantTime(provided, expected)) return { ok: false, reason: 'BAD_SIGNATURE' }

  return { ok: true, eventId }
}

/**
 * Сравнение постоянного времени.
 *
 * Разную длину сравниваем до `timingSafeEqual`: он на разной длине
 * бросает исключение, а не возвращает `false`. Утечки это не создаёт —
 * длина подписи и так известна.
 */
function equalsConstantTime(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

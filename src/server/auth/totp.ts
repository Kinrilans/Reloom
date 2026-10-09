/**
 * Второй фактор оператора (TOTP, RFC 6238).
 *
 * Своя реализация на `node:crypto`: алгоритм — это HMAC от счётчика
 * времени и усечение до шести цифр, и тянуть под него зависимость
 * незачем.
 *
 * Параметры взяты те, которые понимают все приложения-аутентификаторы
 * по умолчанию: SHA-1, шаг 30 секунд, шесть цифр. Менять их нельзя не
 * потому, что SHA-1 тут хорош, а потому, что иначе код не сойдётся
 * ни в одном приложении: в URI они не передаются большинством из них.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const DIGITS = 6
export const STEP_SECONDS = 30

/**
 * Допуск в один шаг в каждую сторону.
 *
 * Часы на телефоне оператора и на сервере расходятся, и без допуска
 * вход ломается у того, у кого они ушли на двадцать секунд. Шире
 * допуск делать не стоит: он же продлевает жизнь подсмотренному коду.
 */
export const WINDOW = 1

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Секрет в base32 — в таком виде его ждут аутентификаторы. */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes))
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/[\s=]/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error(`Не base32: «${char}»`)
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** Код для конкретного шага времени. */
export function totpAt(secret: string, counter: number): string {
  const key = base32Decode(secret)
  const buffer = Buffer.alloc(8)
  // Старшие четыре байта остаются нулями: счётчик уложится в них
  // не раньше 4147 года.
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  buffer.writeUInt32BE(counter >>> 0, 4)

  const digest = createHmac('sha1', key).update(buffer).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

export function totpNow(secret: string, now: Date = new Date()): string {
  return totpAt(secret, Math.floor(now.getTime() / 1000 / STEP_SECONDS))
}

/**
 * Проверка кода.
 *
 * Сравнение постоянного времени и здесь: шесть цифр подбираются по
 * времени ответа так же, как и хэш, просто быстрее.
 */
export function verifyTotp(secret: string, code: string, now: Date = new Date()): boolean {
  const normalized = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(normalized)) return false

  const current = Math.floor(now.getTime() / 1000 / STEP_SECONDS)
  for (let shift = -WINDOW; shift <= WINDOW; shift += 1) {
    if (equal(totpAt(secret, current + shift), normalized)) return true
  }
  return false
}

/** URI для аутентификатора. Секрет в нём есть — значит, ни в лог, ни
 *  в журнал обмена эта строка не попадает. */
export function totpUri(secret: string, email: string, issuer = 'Reloom'): string {
  const label = encodeURIComponent(`${issuer}:${email}`)
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) })
  return `otpauth://totp/${label}?${params.toString()}`
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

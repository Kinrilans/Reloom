/**
 * Пароли операторов.
 *
 * `scrypt` из `node:crypto`, а не внешняя библиотека: подбирать
 * зависимость под хэширование незачем, когда нужная функция есть
 * в платформе (CLAUDE.md, «Стек»).
 *
 * В базе лежит строка с параметрами и солью. Параметры хранятся рядом
 * с хэшем нарочно: когда их придётся поднять, старые пароли должны
 * продолжать проверяться — иначе все операторы разом окажутся
 * заблокированы.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/** Параметры по умолчанию. Память считается как 128 · N · r. */
const PARAMS = { N: 16384, r: 8, p: 1 }
const KEY_LENGTH = 32

export class PasswordError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PasswordError'
  }
}

/** Минимальная длина. Короче — не пароль, а приглашение. */
export const MIN_PASSWORD_LENGTH = 12

export function checkPasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordError(`Пароль короче ${MIN_PASSWORD_LENGTH} символов`)
  }
}

export async function hashPassword(password: string): Promise<string> {
  checkPasswordStrength(password)
  const salt = randomBytes(16)
  const key = await derive(password, salt, PARAMS)
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join(
    '$',
  )
}

/**
 * Проверка пароля.
 *
 * Сравнение постоянного времени: обычное `===` на строках
 * возвращается тем быстрее, чем раньше расходятся байты, и по времени
 * ответа хэш подбирается побайтово.
 *
 * Неразобранный хэш — не повод для исключения: это «пароль не
 * сошёлся». Исключение здесь обернулось бы сообщением, по которому
 * видно, что у этого оператора в базе что-то не то.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false

  const salt = Buffer.from(parts[4] ?? '', 'base64')
  const expected = Buffer.from(parts[5] ?? '', 'base64')
  if (salt.length === 0 || expected.length === 0) return false

  const key = await derive(password, salt, { N, r, p })
  if (key.length !== expected.length) return false
  return timingSafeEqual(key, expected)
}

function derive(password: string, salt: Buffer, params: { N: number; r: number; p: number }) {
  // maxmem задаётся явно: при N=16384,r=8 стандартного потолка в 32 МБ
  // хватает, но стоит поднять параметры — и функция начнёт падать
  // с невнятной ошибкой вместо того, чтобы работать медленнее.
  return scrypt(password, salt, KEY_LENGTH, { ...params, maxmem: 256 * 1024 * 1024 })
}

/**
 * Деньги.
 *
 * Все суммы в системе — целые числа в минорных единицах (центах), тип
 * `bigint`. Ни `number`, ни `Decimal`, ни строки. Арифметика с
 * плавающей точкой над деньгами запрещена категорически: 0.1 + 0.2
 * в двоичной дроби даёт 0.30000000000000004, и на тысяче операций это
 * превращается в расхождение, которое уже не объяснить.
 *
 * Этот файл — единственное место, где минорные единицы превращаются
 * в человеческий вид и обратно. Форматирование применяется только на
 * границе интерфейса; внутри домена ходят `bigint`.
 */

/** Денежная сумма в минорных единицах. Псевдоним ради читаемости. */
export type Minor = bigint

/** Сколько минорных единиц в одной мажорной. Двузначных валют нам
 *  достаточно: карта расчётная в USD, леджер весь в USD. */
const SCALE = 100n

/** Базисных пунктов в единице. 10 000 bps = 100%. */
export const BPS_SCALE = 10_000n

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

/**
 * Разбор строки вида «1234.56», «-12.40», «1 234.56» в минорные единицы.
 *
 * Через строку, а не через `Number`: `parseFloat('0.29') * 100` даёт
 * 28.999999999999996, и центы начинают теряться на ровном месте.
 */
export function parseMinor(input: string): Minor {
  const cleaned = input.replace(/[\s  ]/g, '')
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) {
    throw new MoneyError(`Не сумма: «${input}»`)
  }
  const [, sign, whole, fraction = ''] = match
  const minor = BigInt(whole!) * SCALE + BigInt(fraction.padEnd(2, '0'))
  return sign === '-' ? -minor : minor
}

/**
 * Форматирование для показа: «1 234.56».
 *
 * Разделители НЕ локализуются. «1,234.56» и «1.234,56» — это одно и то
 * же число, прочитанное противоположно, и в финансовом интерфейсе такой
 * риск не нужен (docs/i18n.md).
 */
export function formatMinor(value: Minor): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const whole = abs / SCALE
  const fraction = abs % SCALE
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${negative ? '-' : ''}${grouped}.${fraction.toString().padStart(2, '0')}`
}

/** Сумма с кодом валюты: «1 234.56 USD». */
export function formatMoney(value: Minor, currency = 'USD'): string {
  return `${formatMinor(value)} ${currency}`
}

/**
 * Доля в базисных пунктах, округлённая ВВЕРХ.
 *
 * Правило одно на все комиссии: неполная копейка всегда достаётся нам,
 * а не теряется. Решение владельца продукта; обратное (в пользу
 * пользователя) стоило бы доли копейки на каждой операции, но на
 * потоке это уже заметные деньги.
 *
 * Округление вверх делается явным сложением, а не `Math.ceil`:
 * плавающей точки над деньгами в этом файле нет и быть не может.
 *
 * Отрицательных сумм здесь не бывает — комиссия считается от того, что
 * пришло. Проверяем всё равно: на отрицательной сумме «вверх» означало
 * бы округление к нулю, то есть правило тихо сменило бы знак.
 */
export function applyBps(amount: Minor, bps: number): Minor {
  if (!Number.isInteger(bps) || bps < 0) {
    throw new MoneyError(`Ставка в базисных пунктах должна быть целой и неотрицательной: ${bps}`)
  }
  if (amount < 0n) {
    throw new MoneyError('Доля считается от неотрицательной суммы')
  }
  const exact = amount * BigInt(bps)
  // Целочисленное деление с округлением вверх.
  return (exact + BPS_SCALE - 1n) / BPS_SCALE
}

/** Модуль суммы. */
export function absMinor(value: Minor): Minor {
  return value < 0n ? -value : value
}

/** Наибольшее из двух. */
export function maxMinor(a: Minor, b: Minor): Minor {
  return a > b ? a : b
}

/** Наименьшее из двух. */
export function minMinor(a: Minor, b: Minor): Minor {
  return a < b ? a : b
}

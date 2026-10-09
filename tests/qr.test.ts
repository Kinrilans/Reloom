/**
 * QR-код.
 *
 * Проверять картинку глазами бесполезно: неверный код выглядит ровно
 * как верный. Поэтому здесь три независимых опоры.
 *
 *   1. **Геометрия против таблицы.** Ёмкость версии считается из числа
 *      свободных модулей матрицы и обязана сойтись с суммой слов по
 *      таблице блоков. Опечатка в таблице ломает этот тест.
 *   2. **Синдромы Рида—Соломона.** Кодовое слово блока обязано делиться
 *      на образующий многочлен нацело, то есть обращаться в ноль во
 *      всех его корнях. Это и проверяет сканер.
 *   3. **Обратный разбор.** Тест читает готовую матрицу так, как её
 *      читал бы сканер: берёт маску из сведений о формате, снимает её,
 *      расслаивает перемежение и достаёт исходную строку. Проходит
 *      только если раскладка, маска и перемежение верны все сразу.
 *
 * Арифметика поля проверяется отдельно — наивным умножением
 * многочленов, написанным здесь же: общая ошибка в таблицах
 * синдромами не ловится.
 */

import { describe, expect, it } from 'vitest'
import {
  MASKS,
  MAX_VERSION,
  QrError,
  dataCodewords,
  ecCodewords,
  encodeQr,
  formatBits,
  gfExp,
  gfMul,
  planFor,
  reservedMap,
  sizeOf,
  versionBits,
  type EccLevel,
} from '@/shared/qr'

const LEVELS: EccLevel[] = ['L', 'M', 'Q', 'H']

/** Ссылка на настройку второго фактора — то, ради чего всё затевалось. */
const OTPAUTH =
  'otpauth://totp/Reloom:operator@reloom.example?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' +
  '&issuer=Reloom&algorithm=SHA1&digits=6&period=30'

/* --------------------------------------------------------------------------
   Поле GF(256)
   -------------------------------------------------------------------------- */

/** Умножение в лоб: сложение сдвигов с приведением по модулю. */
function slowMul(a: number, b: number): number {
  let result = 0
  let left = a
  let right = b
  for (; right !== 0; right >>= 1) {
    if (right & 1) result ^= left
    left <<= 1
    if (left & 0x100) left ^= 0x11d
  }
  return result
}

describe('поле GF(256)', () => {
  it('УМНОЖЕНИЕ ПО ТАБЛИЦАМ СОВПАДАЕТ С УМНОЖЕНИЕМ В ЛОБ', () => {
    for (let a = 0; a < 256; a += 1) {
      for (let b = 0; b < 256; b += 1) {
        expect(gfMul(a, b)).toBe(slowMul(a, b))
      }
    }
  })

  it('ПОРЯДОК ОБРАЗУЮЩЕГО ЭЛЕМЕНТА РАВЕН 255', () => {
    expect(gfExp(0)).toBe(1)
    // Если бы порядок был меньше, таблица логарифмов накрывала бы
    // не всё поле и часть произведений считалась бы неверно.
    const seen = new Set<number>()
    for (let i = 0; i < 255; i += 1) seen.add(gfExp(i))
    expect(seen.size).toBe(255)
    expect(seen.has(0)).toBe(false)
  })
})

/* --------------------------------------------------------------------------
   Таблицы
   -------------------------------------------------------------------------- */

describe('таблицы версий', () => {
  it('ЁМКОСТЬ ИЗ ТАБЛИЦЫ СХОДИТСЯ С ГЕОМЕТРИЕЙ МАТРИЦЫ', () => {
    for (let version = 1; version <= MAX_VERSION; version += 1) {
      const size = sizeOf(version)
      const reserved = reservedMap(version)
      let busy = 0
      for (const row of reserved) for (const cell of row) if (cell) busy += 1
      const free = size * size - busy
      const totalWords = Math.floor(free / 8)

      for (const ecc of LEVELS) {
        const [ecPerBlock, blocks1, , blocks2] = planFor(version, ecc)
        const blocks = blocks1 + blocks2
        expect({ version, ecc, words: dataCodewords(version, ecc) + ecPerBlock * blocks }).toEqual({
          version,
          ecc,
          words: totalWords,
        })
      }
    }
  })

  it('СВЕДЕНИЯ О ФОРМАТЕ ДЕЛЯТСЯ НА СВОЙ МНОГОЧЛЕН', () => {
    // Опорное значение из стандарта: уровень M с нулевой маской даёт
    // чистую маску 0x5412, потому что и данные, и BCH-остаток нулевые.
    expect(formatBits('M', 0)).toBe(0x5412)

    for (const ecc of LEVELS) {
      for (let mask = 0; mask < 8; mask += 1) {
        const bits = formatBits(ecc, mask) ^ 0x5412
        let rest = bits
        for (let shift = 14; shift >= 10; shift -= 1) {
          if ((rest >> shift) & 1) rest ^= 0x537 << (shift - 10)
        }
        expect({ ecc, mask, rest }).toEqual({ ecc, mask, rest: 0 })
      }
    }
  })

  it('НОМЕР ВЕРСИИ КОДИРУЕТСЯ С ЗАПАСОМ ПО РАССТОЯНИЮ', () => {
    const codes: number[] = []
    for (let version = 7; version <= MAX_VERSION; version += 1) {
      const bits = versionBits(version)
      expect(bits >> 12).toBe(version)
      codes.push(bits)
    }
    // Код версии исправляет до трёх ошибок, поэтому любые два слова
    // расходятся не меньше чем в восьми битах.
    for (let i = 0; i < codes.length; i += 1) {
      for (let j = i + 1; j < codes.length; j += 1) {
        let distance = 0
        for (let bit = 0; bit < 18; bit += 1) {
          if (((codes[i]! >> bit) & 1) !== ((codes[j]! >> bit) & 1)) distance += 1
        }
        expect(distance).toBeGreaterThanOrEqual(8)
      }
    }
  })
})

/* --------------------------------------------------------------------------
   Рид—Соломон
   -------------------------------------------------------------------------- */

/** Значение многочлена в точке: коэффициенты по убыванию степени. */
function evaluate(poly: Uint8Array, at: number): number {
  let value = 0
  for (const coefficient of poly) value = gfMul(value, at) ^ coefficient
  return value
}

describe('проверочные слова', () => {
  it('КОДОВОЕ СЛОВО ОБРАЩАЕТСЯ В НОЛЬ ВО ВСЕХ КОРНЯХ', () => {
    const data = Uint8Array.from({ length: 16 }, (_, i) => (i * 37 + 11) & 0xff)
    const count = 10
    const whole = Uint8Array.from([...data, ...ecCodewords(data, count)])
    for (let i = 0; i < count; i += 1) {
      expect(evaluate(whole, gfExp(i))).toBe(0)
    }
  })

  it('ИСПОРЧЕННОЕ СЛОВО В НОЛЬ НЕ ОБРАЩАЕТСЯ', () => {
    const data = Uint8Array.from({ length: 16 }, (_, i) => i + 1)
    const whole = Uint8Array.from([...data, ...ecCodewords(data, 10)])
    whole[3] = whole[3]! ^ 0x5a
    const syndromes = Array.from({ length: 10 }, (_, i) => evaluate(whole, gfExp(i)))
    expect(syndromes.some((value) => value !== 0)).toBe(true)
  })
})

/* --------------------------------------------------------------------------
   Обратный разбор: читаем матрицу как сканер
   -------------------------------------------------------------------------- */

interface Decoded {
  text: string
  version: number
  ecc: EccLevel
  mask: number
  /** Блоки целиком, данные вместе с проверочными словами. */
  blocks: Uint8Array[]
}

const ECC_BY_BITS: Record<number, EccLevel> = { 0b01: 'L', 0b00: 'M', 0b11: 'Q', 0b10: 'H' }

function decode(modules: readonly (readonly boolean[])[]): Decoded {
  const size = modules.length
  const version = (size - 17) / 4

  // Сведения о формате — первая копия, вдоль левого края и восьмой строки.
  let format = 0
  for (let i = 0; i < 15; i += 1) {
    const dark =
      i < 6 ? modules[i]![8]! : i < 8 ? modules[i + 1]![8]! : modules[size - 15 + i]![8]!
    if (dark) format |= 1 << i
  }
  format ^= 0x5412
  const ecc = ECC_BY_BITS[(format >> 13) & 0b11]!
  const mask = (format >> 10) & 0b111

  // Вторая копия обязана совпадать с первой, иначе сканер возьмёт её
  // и прочтёт другое.
  let mirror = 0
  for (let i = 0; i < 15; i += 1) {
    const dark =
      i < 8 ? modules[8]![size - 1 - i]! : i === 8 ? modules[8]![7]! : modules[8]![14 - i]!
    if (dark) mirror |= 1 << i
  }
  expect(mirror ^ 0x5412).toBe(format)

  // Та же змейка, что при записи, только читаем и снимаем маску.
  const reserved = reservedMap(version)
  const unmask = MASKS[mask]!
  const bits: number[] = []
  let row = size - 1
  let dir = -1
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5
    for (;;) {
      for (let c = 0; c < 2; c += 1) {
        const column = col - c
        if (reserved[row]![column]) continue
        const dark = modules[row]![column]!
        bits.push((unmask(row, column) ? !dark : dark) ? 1 : 0)
      }
      row += dir
      if (row < 0 || row >= size) {
        row -= dir
        dir = -dir
        break
      }
    }
  }

  const [ecPerBlock, blocks1, words1, blocks2, words2] = planFor(version, ecc)
  const totalWords = dataCodewords(version, ecc) + ecPerBlock * (blocks1 + blocks2)
  const stream = new Uint8Array(totalWords)
  for (let i = 0; i < totalWords; i += 1) {
    let byte = 0
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i * 8 + j]!
    stream[i] = byte
  }

  // Расслоение: обратное перемежению.
  const lengths: number[] = []
  for (let i = 0; i < blocks1; i += 1) lengths.push(words1)
  for (let i = 0; i < blocks2; i += 1) lengths.push(words2)
  const data: number[][] = lengths.map(() => [])
  const check: number[][] = lengths.map(() => [])

  let cursor = 0
  const longest = Math.max(words1, words2)
  for (let i = 0; i < longest; i += 1) {
    for (let b = 0; b < lengths.length; b += 1) {
      if (i < lengths[b]!) data[b]!.push(stream[cursor++]!)
    }
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (let b = 0; b < lengths.length; b += 1) check[b]!.push(stream[cursor++]!)
  }

  const words = Uint8Array.from(data.flat())
  const countWidth = version <= 9 ? 8 : 16
  const read = (at: number, width: number): number => {
    let value = 0
    for (let i = 0; i < width; i += 1) {
      const index = at + i
      value = (value << 1) | ((words[index >> 3]! >> (7 - (index & 7))) & 1)
    }
    return value
  }

  expect(read(0, 4)).toBe(0b0100)
  const length = read(4, countWidth)
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i += 1) bytes[i] = read(4 + countWidth + i * 8, 8)

  return {
    text: new TextDecoder().decode(bytes),
    version,
    ecc,
    mask,
    blocks: data.map((block, i) => Uint8Array.from([...block, ...check[i]!])),
  }
}

describe('кодирование строки', () => {
  it('ССЫЛКА НА ВТОРОЙ ФАКТОР ЧИТАЕТСЯ ОБРАТНО', () => {
    const code = encodeQr(OTPAUTH)
    const decoded = decode(code.modules)
    expect(decoded.text).toBe(OTPAUTH)
    expect(decoded.version).toBe(code.version)
    expect(decoded.ecc).toBe('M')
  })

  it('ЧИТАЕТСЯ НА ВСЕХ УРОВНЯХ И ВСЕХ ДЛИНАХ', () => {
    for (const ecc of LEVELS) {
      for (const length of [1, 7, 16, 31, 64, 100]) {
        const text = Array.from({ length }, (_, i) =>
          String.fromCharCode(33 + ((i * 7) % 90)),
        ).join('')
        const code = encodeQr(text, ecc)
        const decoded = decode(code.modules)
        expect({ ecc, length, text: decoded.text }).toEqual({ ecc, length, text })
        expect({ ecc, length, level: decoded.ecc }).toEqual({ ecc, length, level: ecc })
      }
    }
  })

  it('КАЖДЫЙ БЛОК ПРОХОДИТ ПРОВЕРКУ РИДА—СОЛОМОНА', () => {
    for (const ecc of LEVELS) {
      const code = encodeQr('x'.repeat(100), ecc)
      const decoded = decode(code.modules)
      const [ecPerBlock] = planFor(decoded.version, ecc)
      for (const block of decoded.blocks) {
        for (let i = 0; i < ecPerBlock; i += 1) {
          expect(evaluate(block, gfExp(i))).toBe(0)
        }
      }
    }
  })

  it('ССЫЛКА НА ВТОРОЙ ФАКТОР РАСКЛАДЫВАЕТСЯ НА НЕСКОЛЬКО БЛОКОВ', () => {
    // Ошибка в перемежении на одном блоке не видна: слои совпадают
    // с исходным порядком. Проверяем на том, что показываем на деле.
    const decoded = decode(encodeQr(OTPAUTH).modules)
    expect(decoded.blocks.length).toBeGreaterThan(1)
    expect(decoded.text).toBe(OTPAUTH)
  })

  it('УРОВЕНЬ H ДЕСЯТОЙ ВЕРСИИ НЕ ТЯНЕТ ДЛИННУЮ ССЫЛКУ', () => {
    // Граница зафиксирована нарочно: показываем мы код на уровне M,
    // где запас больше двухсот байт, и если кто-то переведёт показ
    // на H — упрётся здесь, а не в нечитаемый код у оператора.
    expect(() => encodeQr(OTPAUTH, 'H')).toThrow(QrError)
    expect(encodeQr(OTPAUTH, 'M').version).toBeLessThanOrEqual(MAX_VERSION)
  })

  it('КИРИЛЛИЦА ПЕРЕЖИВАЕТ ОБХОД', () => {
    const text = 'Релум: проверка 2ФА'
    expect(decode(encodeQr(text).modules).text).toBe(text)
  })

  it('ВЕРСИЯ БЕРЁТСЯ НАИМЕНЬШАЯ ПОДХОДЯЩАЯ', () => {
    // На уровне M первая версия держит 14 байт: 16 слов минус заголовок.
    expect(encodeQr('a'.repeat(14), 'M').version).toBe(1)
    expect(encodeQr('a'.repeat(15), 'M').version).toBe(2)
  })

  it('СЛИШКОМ ДЛИННАЯ СТРОКА ОТКАЗЫВАЕТСЯ, А НЕ ОБРЕЗАЕТСЯ', () => {
    // Молча обрезать нельзя: получился бы код, который сканируется
    // и даёт не тот секрет.
    expect(() => encodeQr('a'.repeat(5000))).toThrow(QrError)
  })

  it('ПУСТАЯ СТРОКА ОТКАЗЫВАЕТСЯ', () => {
    expect(() => encodeQr('')).toThrow(QrError)
  })
})

describe('матрица', () => {
  it('УЗОРЫ СТОЯТ НА МЕСТАХ', () => {
    const code = encodeQr(OTPAUTH)
    const m = code.modules
    const size = code.size

    for (const [top, left] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ] as const) {
      expect(m[top]![left]).toBe(true)
      expect(m[top + 1]![left + 1]).toBe(false)
      expect(m[top + 3]![left + 3]).toBe(true)
    }

    // Синхрополосы чередуются и начинаются с тёмного.
    for (let i = 8; i < size - 8; i += 1) {
      expect(m[6]![i]).toBe(i % 2 === 0)
      expect(m[i]![6]).toBe(i % 2 === 0)
    }

    // Тёмный модуль — всегда тёмный.
    expect(m[size - 8]![8]).toBe(true)
  })

  it('РАЗМЕР ОТВЕЧАЕТ ВЕРСИИ', () => {
    const code = encodeQr(OTPAUTH)
    expect(code.size).toBe(sizeOf(code.version))
    expect(code.modules.length).toBe(code.size)
    for (const row of code.modules) expect(row.length).toBe(code.size)
  })
})

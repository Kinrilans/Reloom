/**
 * Генератор QR-кода (ISO/IEC 18004), режим байтов.
 *
 * Своя реализация по тем же причинам, что и TOTP рядом: алгоритм
 * закрытый и неизменный — коды Рида—Соломона над GF(256), раскладка
 * змейкой и выбор маски по штрафам. Тянуть под это зависимость
 * в проект, который двигает чужие деньги, значило бы добавить в сборку
 * чужой код ради картинки.
 *
 * Зачем он понадобился: секрет второго фактора — тридцать два символа,
 * и набрать их в телефоне руками это несколько минут и почти
 * обязательная опечатка. Строка остаётся рядом с кодом как запасной
 * путь, но основной теперь — сканирование.
 *
 * Поддерживаются версии с 1 по 10: до 271 байта на уровне M, с запасом
 * и для `otpauth://`-ссылки, и для крипто-адреса. Больше не нужно,
 * а каждая лишняя версия — это строка таблицы, которую нельзя
 * проверить глазами.
 *
 * Таблицу блоков проверяет тест против геометрии матрицы: число
 * кодовых слов версии считается из числа свободных модулей и обязано
 * сойтись с суммой по таблице. Опечатка в числе ломает тест, а не
 * чей-то вход в систему.
 */

/** Уровень избыточности: L≈7%, M≈15%, Q≈25%, H≈30% повреждений. */
export type EccLevel = 'L' | 'M' | 'Q' | 'H'

export interface QrCode {
  /** Сторона кода в модулях, без полей. */
  readonly size: number
  readonly version: number
  /** `modules[строка][столбец]`, `true` — тёмный модуль. */
  readonly modules: readonly (readonly boolean[])[]
}

export class QrError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QrError'
  }
}

/** Самая большая поддерживаемая версия. */
export const MAX_VERSION = 10

/* --------------------------------------------------------------------------
   Арифметика GF(256)
   -------------------------------------------------------------------------- */

/** Примитивный многочлен QR: x⁸ + x⁴ + x³ + x² + 1. */
const PRIMITIVE = 0x11d

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)

for (let i = 0, x = 1; i < 255; i += 1) {
  EXP[i] = x
  LOG[x] = i
  x <<= 1
  if (x & 0x100) x ^= PRIMITIVE
}
for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]!

/** Умножение в поле. Ноль поглощает: логарифма у него нет. */
export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a]! + LOG[b]!]!
}

/** Степень образующего элемента — нужна тесту для проверки таблиц. */
export function gfExp(power: number): number {
  return EXP[power % 255]!
}

/**
 * Образующий многочлен для `degree` проверочных слов:
 * (x − α⁰)(x − α¹)…(x − α^(degree−1)). Коэффициенты по убыванию степени.
 */
export function generatorPoly(degree: number): Uint8Array {
  let poly = Uint8Array.of(1)
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1)
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = next[j]! ^ poly[j]!
      next[j + 1] = next[j + 1]! ^ gfMul(poly[j]!, EXP[i]!)
    }
    poly = next
  }
  return poly
}

/** Проверочные слова блока: остаток от деления на образующий многочлен. */
export function ecCodewords(data: Uint8Array, count: number): Uint8Array {
  const gen = generatorPoly(count)
  const rest = new Uint8Array(data.length + count)
  rest.set(data)
  for (let i = 0; i < data.length; i += 1) {
    const factor = rest[i]!
    if (factor === 0) continue
    // gen[0] всегда 1, поэтому ведущий байт обнуляется сам.
    for (let j = 0; j < gen.length; j += 1) {
      rest[i + j] = rest[i + j]! ^ gfMul(gen[j]!, factor)
    }
  }
  return rest.slice(data.length)
}

/* --------------------------------------------------------------------------
   Таблицы версий
   -------------------------------------------------------------------------- */

/** `[проверочных слов на блок, блоков группы 1, слов в них, блоков группы 2, слов в них]`. */
type BlockPlan = readonly [number, number, number, number, number]

const BLOCKS: Record<EccLevel, readonly BlockPlan[]> = {
  L: [
    [7, 1, 19, 0, 0],
    [10, 1, 34, 0, 0],
    [15, 1, 55, 0, 0],
    [20, 1, 80, 0, 0],
    [26, 1, 108, 0, 0],
    [18, 2, 68, 0, 0],
    [20, 2, 78, 0, 0],
    [24, 2, 97, 0, 0],
    [30, 2, 116, 0, 0],
    [18, 2, 68, 2, 69],
  ],
  M: [
    [10, 1, 16, 0, 0],
    [16, 1, 28, 0, 0],
    [26, 1, 44, 0, 0],
    [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0],
    [18, 4, 31, 0, 0],
    [22, 2, 38, 2, 39],
    [22, 3, 36, 2, 37],
    [26, 4, 43, 1, 44],
  ],
  Q: [
    [13, 1, 13, 0, 0],
    [22, 1, 22, 0, 0],
    [18, 2, 17, 0, 0],
    [26, 2, 24, 0, 0],
    [18, 2, 15, 2, 16],
    [24, 4, 19, 0, 0],
    [18, 2, 14, 4, 15],
    [22, 4, 18, 2, 19],
    [20, 4, 16, 4, 17],
    [24, 6, 19, 2, 20],
  ],
  H: [
    [17, 1, 9, 0, 0],
    [28, 1, 16, 0, 0],
    [22, 2, 13, 0, 0],
    [16, 4, 9, 0, 0],
    [22, 2, 11, 2, 12],
    [28, 4, 15, 0, 0],
    [26, 4, 13, 1, 14],
    [26, 4, 14, 2, 15],
    [24, 4, 12, 4, 13],
    [28, 6, 15, 2, 16],
  ],
}

/** Центры совмещающих узоров по версиям. */
const ALIGNMENT: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
]

export function planFor(version: number, ecc: EccLevel): BlockPlan {
  const plan = BLOCKS[ecc][version - 1]
  if (!plan) throw new QrError(`Версия ${version} не поддерживается`)
  return plan
}

/** Сколько слов данных помещается в версию на этом уровне. */
export function dataCodewords(version: number, ecc: EccLevel): number {
  const [, blocks1, words1, blocks2, words2] = planFor(version, ecc)
  return blocks1 * words1 + blocks2 * words2
}

export function sizeOf(version: number): number {
  return version * 4 + 17
}

/* --------------------------------------------------------------------------
   Кодирование данных
   -------------------------------------------------------------------------- */

/** Счётчик длины в режиме байтов: 8 бит до девятой версии, дальше 16. */
function countBits(version: number): number {
  return version <= 9 ? 8 : 16
}

function pickVersion(byteLength: number, ecc: EccLevel): number {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    const capacity = dataCodewords(version, ecc) * 8
    if (4 + countBits(version) + byteLength * 8 <= capacity) return version
  }
  throw new QrError(
    `Не помещается: ${byteLength} байт, предел — ${dataCodewords(MAX_VERSION, ecc) - 3} байта`,
  )
}

/** Слова данных с заголовком, терминатором и добивкой. */
function encodeData(bytes: Uint8Array, version: number, ecc: EccLevel): Uint8Array {
  const total = dataCodewords(version, ecc)
  const bits: number[] = []
  const push = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i -= 1) bits.push((value >> i) & 1)
  }

  push(0b0100, 4) // режим байтов
  push(bytes.length, countBits(version))
  for (const byte of bytes) push(byte, 8)

  // Терминатор — до четырёх нулей, но не за пределы ёмкости.
  const capacity = total * 8
  for (let i = 0; i < 4 && bits.length < capacity; i += 1) bits.push(0)
  for (; bits.length % 8 !== 0; ) bits.push(0)

  const words = new Uint8Array(total)
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j]!
    words[i / 8] = byte
  }

  // Добивка чередующимися 0xEC и 0x11 — так предписывает стандарт.
  for (let i = bits.length / 8, odd = false; i < total; i += 1, odd = !odd) {
    words[i] = odd ? 0x11 : 0xec
  }
  return words
}

/**
 * Разложить по блокам, посчитать проверочные слова и перемежить.
 *
 * Перемежение — не украшение: оно разносит соседние слова одного блока
 * по разным углам кода, и царапина бьёт понемногу по каждому блоку,
 * а не выносит один блок целиком.
 */
function interleave(words: Uint8Array, version: number, ecc: EccLevel): Uint8Array {
  const [ecPerBlock, blocks1, words1, blocks2, words2] = planFor(version, ecc)

  const data: Uint8Array[] = []
  const check: Uint8Array[] = []
  let offset = 0
  for (let i = 0; i < blocks1 + blocks2; i += 1) {
    const length = i < blocks1 ? words1 : words2
    const block = words.slice(offset, offset + length)
    offset += length
    data.push(block)
    check.push(ecCodewords(block, ecPerBlock))
  }

  const out: number[] = []
  const longest = Math.max(words1, words2)
  for (let i = 0; i < longest; i += 1) {
    for (const block of data) if (i < block.length) out.push(block[i]!)
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of check) out.push(block[i]!)
  }
  return Uint8Array.from(out)
}

/* --------------------------------------------------------------------------
   Матрица
   -------------------------------------------------------------------------- */

interface Canvas {
  size: number
  modules: boolean[][]
  /** Служебные модули: данные их не занимают и маска их не трогает. */
  fixed: boolean[][]
}

function blank(version: number): Canvas {
  const size = sizeOf(version)
  return {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    fixed: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  }
}

function put(canvas: Canvas, row: number, col: number, dark: boolean): void {
  canvas.modules[row]![col] = dark
  canvas.fixed[row]![col] = true
}

/** Поисковый узор вместе с белой разделительной полосой вокруг. */
function placeFinder(canvas: Canvas, top: number, left: number): void {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const row = top + r
      const col = left + c
      if (row < 0 || row >= canvas.size || col < 0 || col >= canvas.size) continue
      const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6
      const ring = r === 0 || r === 6 || c === 0 || c === 6
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
      put(canvas, row, col, inside && (ring || core))
    }
  }
}

function placeAlignment(canvas: Canvas, version: number): void {
  const centers = ALIGNMENT[version - 1]!
  for (const row of centers) {
    for (const col of centers) {
      // Углы заняты поисковыми узорами.
      const atFinder =
        (row === 6 && col === 6) ||
        (row === 6 && col === canvas.size - 7) ||
        (row === canvas.size - 7 && col === 6)
      if (atFinder) continue
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const ring = Math.abs(r) === 2 || Math.abs(c) === 2
          const core = r === 0 && c === 0
          put(canvas, row + r, col + c, ring || core)
        }
      }
    }
  }
}

function placeTiming(canvas: Canvas): void {
  for (let i = 8; i < canvas.size - 8; i += 1) {
    const dark = i % 2 === 0
    put(canvas, 6, i, dark)
    put(canvas, i, 6, dark)
  }
}

/** Длина значения в битах — нужна делению BCH. */
function bitLength(value: number): number {
  let length = 0
  for (let v = value; v !== 0; v >>>= 1) length += 1
  return length
}

const ECC_BITS: Record<EccLevel, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 }

/** Пятнадцать бит сведений о формате: уровень, маска, BCH и маска 0x5412. */
export function formatBits(ecc: EccLevel, mask: number): number {
  const data = (ECC_BITS[ecc] << 3) | mask
  let rest = data << 10
  for (; bitLength(rest) >= 11; ) rest ^= 0x537 << (bitLength(rest) - 11)
  return ((data << 10) | rest) ^ 0x5412
}

/** Восемнадцать бит номера версии — только с седьмой. */
export function versionBits(version: number): number {
  let rest = version << 12
  for (; bitLength(rest) >= 13; ) rest ^= 0x1f25 << (bitLength(rest) - 13)
  return (version << 12) | rest
}

/** Зарезервировать места под сведения о формате и версии. */
function reserve(canvas: Canvas, version: number): void {
  const size = canvas.size
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      canvas.fixed[8]![i] = true
      canvas.fixed[i]![8] = true
    }
  }
  for (let i = 0; i < 8; i += 1) {
    canvas.fixed[8]![size - 1 - i] = true
    canvas.fixed[size - 1 - i]![8] = true
  }
  // Тёмный модуль — он всегда тёмный и всегда здесь.
  put(canvas, size - 8, 8, true)

  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const row = Math.floor(i / 3)
      const col = size - 11 + (i % 3)
      canvas.fixed[row]![col] = true
      canvas.fixed[col]![row] = true
    }
  }
}

function writeFormat(canvas: Canvas, ecc: EccLevel, mask: number): void {
  const size = canvas.size
  const bits = formatBits(ecc, mask)
  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >> i) & 1) === 1
    // Вертикальная копия вдоль левого края.
    if (i < 6) canvas.modules[i]![8] = dark
    else if (i < 8) canvas.modules[i + 1]![8] = dark
    else canvas.modules[size - 15 + i]![8] = dark
    // Горизонтальная копия вдоль восьмой строки.
    if (i < 8) canvas.modules[8]![size - 1 - i] = dark
    else if (i === 8) canvas.modules[8]![7] = dark
    else canvas.modules[8]![14 - i] = dark
  }
}

function writeVersion(canvas: Canvas, version: number): void {
  if (version < 7) return
  const size = canvas.size
  const bits = versionBits(version)
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >> i) & 1) === 1
    const row = Math.floor(i / 3)
    const col = size - 11 + (i % 3)
    canvas.modules[row]![col] = dark
    canvas.modules[col]![row] = dark
  }
}

type MaskFn = (row: number, col: number) => boolean

/** Восемь масок стандарта. Менять формулы нельзя: их знает сканер. */
export const MASKS: readonly MaskFn[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

/**
 * Разложить биты данных по матрице змейкой: парами столбцов справа
 * налево, вверх и вниз попеременно, минуя служебные модули и
 * вертикальную синхрополосу.
 */
function placeData(canvas: Canvas, words: Uint8Array, mask: MaskFn): void {
  const size = canvas.size
  const total = words.length * 8
  let bit = 0
  const next = (): boolean => {
    // Хвост за пределами данных — нули: так предписывает стандарт.
    if (bit >= total) return false
    const value = ((words[bit >> 3]! >> (7 - (bit & 7))) & 1) === 1
    bit += 1
    return value
  }

  let row = size - 1
  let dir = -1
  for (let col = size - 1; col > 0; col -= 2) {
    // Шестой столбец — синхрополоса, пара столбцов её перешагивает.
    if (col === 6) col = 5
    for (;;) {
      for (let c = 0; c < 2; c += 1) {
        const column = col - c
        if (canvas.fixed[row]![column]) continue
        const dark = next()
        canvas.modules[row]![column] = mask(row, column) ? !dark : dark
      }
      row += dir
      if (row < 0 || row >= size) {
        row -= dir
        dir = -dir
        break
      }
    }
  }
}

/* --------------------------------------------------------------------------
   Выбор маски
   -------------------------------------------------------------------------- */

/**
 * Штраф по четырём правилам стандарта. Побеждает маска с наименьшим:
 * сканеру нужен код без длинных полос, без крупных одноцветных пятен,
 * без узоров, похожих на поисковые, и примерно наполовину тёмный.
 */
export function penalty(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length
  let score = 0

  // Правило 1: полосы от пяти модулей одного цвета.
  for (let i = 0; i < size; i += 1) {
    for (const horizontal of [true, false]) {
      let run = 1
      for (let j = 1; j < size; j += 1) {
        const prev = horizontal ? modules[i]![j - 1]! : modules[j - 1]![i]!
        const curr = horizontal ? modules[i]![j]! : modules[j]![i]!
        if (curr === prev) {
          run += 1
          continue
        }
        if (run >= 5) score += 3 + (run - 5)
        run = 1
      }
      if (run >= 5) score += 3 + (run - 5)
    }
  }

  // Правило 2: одноцветные квадраты два на два.
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = modules[r]![c]!
      if (v === modules[r]![c + 1]! && v === modules[r + 1]![c]! && v === modules[r + 1]![c + 1]!) {
        score += 3
      }
    }
  }

  // Правило 3: узор 1:1:3:1:1 с полем — сканер принимает его за поисковый.
  const pattern = [true, false, true, true, true, false, true]
  const quiet = [false, false, false, false]
  const forward = [...pattern, ...quiet]
  const backward = [...quiet, ...pattern]
  const matches = (get: (k: number) => boolean, at: number, shape: boolean[]): boolean => {
    for (let k = 0; k < shape.length; k += 1) if (get(at + k) !== shape[k]!) return false
    return true
  }
  for (let i = 0; i < size; i += 1) {
    const row = (k: number) => modules[i]![k]!
    const col = (k: number) => modules[k]![i]!
    for (let j = 0; j + 11 <= size; j += 1) {
      if (matches(row, j, forward) || matches(row, j, backward)) score += 40
      if (matches(col, j, forward) || matches(col, j, backward)) score += 40
    }
  }

  // Правило 4: перекос светлого и тёмного.
  let dark = 0
  for (const row of modules) for (const cell of row) if (cell) dark += 1
  const percent = (dark * 100) / (size * size)
  score += Math.floor(Math.abs(percent - 50) / 5) * 10

  return score
}

/* --------------------------------------------------------------------------
   Сборка
   -------------------------------------------------------------------------- */

/**
 * Построить код для строки.
 *
 * Уровень M по умолчанию: он держит пятнадцать процентов повреждений —
 * достаточно и для экрана, и для бумаги, и не раздувает код так, как Q.
 */
export function encodeQr(text: string, ecc: EccLevel = 'M'): QrCode {
  if (text === '') throw new QrError('Пустая строка')
  const bytes = new TextEncoder().encode(text)
  const version = pickVersion(bytes.length, ecc)
  const words = interleave(encodeData(bytes, version, ecc), version, ecc)

  let best: Canvas | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 8; mask += 1) {
    const canvas = blank(version)
    placeFinder(canvas, 0, 0)
    placeFinder(canvas, 0, canvas.size - 7)
    placeFinder(canvas, canvas.size - 7, 0)
    placeAlignment(canvas, version)
    placeTiming(canvas)
    reserve(canvas, version)
    placeData(canvas, words, MASKS[mask]!)
    writeFormat(canvas, ecc, mask)
    writeVersion(canvas, version)

    const score = penalty(canvas.modules)
    if (score < bestScore) {
      bestScore = score
      best = canvas
    }
  }

  const chosen = best!
  return { size: chosen.size, version, modules: chosen.modules }
}

/**
 * Карта служебных модулей версии: `true` — место занято узором или
 * сведениями о формате, данные туда не кладутся.
 *
 * Нужна тесту: по ней он считает ёмкость версии из геометрии и сверяет
 * с таблицей блоков, а также проходит раскладку в обратную сторону.
 * Считается построением матрицы, а не формулой — формулу пришлось бы
 * проверять отдельно.
 */
export function reservedMap(version: number): boolean[][] {
  const canvas = blank(version)
  placeFinder(canvas, 0, 0)
  placeFinder(canvas, 0, canvas.size - 7)
  placeFinder(canvas, canvas.size - 7, 0)
  placeAlignment(canvas, version)
  placeTiming(canvas)
  reserve(canvas, version)
  return canvas.fixed
}

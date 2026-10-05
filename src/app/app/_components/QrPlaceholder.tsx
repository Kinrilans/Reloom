/**
 * Заглушка QR-кода.
 *
 * Это НЕ настоящий QR: он не сканируется. В прототипе нет ни реальных
 * адресов, ни реальных номеров карт, и рисовать работающий код было бы
 * хуже — его попробовали бы отсканировать. Задача фигуры одна: занять
 * столько же места, сколько займёт настоящий, чтобы вёрстка экрана была
 * проверена на реальном объёме.
 *
 * Узор детерминированный: один и тот же адрес даёт одну и ту же картинку.
 */

const GRID = 21

function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function isFinder(x: number, y: number): boolean {
  const inBox = (ox: number, oy: number) =>
    x >= ox && x < ox + 7 && y >= oy && y < oy + 7
  return inBox(0, 0) || inBox(GRID - 7, 0) || inBox(0, GRID - 7)
}

function finderFilled(x: number, y: number): boolean {
  const local = (ox: number, oy: number) => {
    const lx = x - ox
    const ly = y - oy
    const edge = lx === 0 || ly === 0 || lx === 6 || ly === 6
    const core = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4
    return edge || core
  }
  if (x < 7 && y < 7) return local(0, 0)
  if (x >= GRID - 7 && y < 7) return local(GRID - 7, 0)
  return local(0, GRID - 7)
}

export function QrPlaceholder({ value, size = 168 }: { value: string; size?: number }) {
  const seed = hash(value)
  const cells: { x: number; y: number }[] = []

  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (isFinder(x, y)) {
        if (finderFilled(x, y)) cells.push({ x, y })
        continue
      }
      // Псевдослучайно, но устойчиво: смесь координат с зерном адреса.
      const bit = hash(`${seed}:${x}:${y}`) % 100
      if (bit < 46) cells.push({ x, y })
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${GRID} ${GRID}`}
      role="img"
      aria-label="QR-код адреса"
      shapeRendering="crispEdges"
    >
      <rect width={GRID} height={GRID} fill="var(--text)" opacity="0" />
      {cells.map((c) => (
        <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width="1" height="1" fill="var(--text)" />
      ))}
    </svg>
  )
}

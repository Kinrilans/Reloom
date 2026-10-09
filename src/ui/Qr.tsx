import { encodeQr, type EccLevel } from '@/shared/qr'

/**
 * Настоящий QR-код, который сканируется.
 *
 * Рядом живёт `QrPlaceholder` — нарисованная заглушка для прототипа.
 * Заменять её везде разом не надо: у клиентской части свой этап,
 * и там код строится из крипто-адреса, а не из секрета.
 *
 * **Код всегда тёмный по белому, независимо от темы.** Это не
 * недосмотр оформления: инвертированный код телефон не читает, и
 * «красиво в тёмной теме» означало бы «не работает ночью». Поэтому
 * здесь зашиты чёрный и белый, а не переменные палитры, и белое поле
 * вокруг кода — часть самого кода, без него сканер не находит границу.
 *
 * Строка под кодом остаётся обязательной: код показывают с экрана
 * ноутбука, и если телефон не берёт, человеку нужен запасной путь.
 */

export interface QrProps {
  /** Что кодируем. Для второго фактора — ссылка `otpauth://`. */
  value: string
  /** Сторона картинки в пикселях, вместе с белым полем. */
  size?: number
  /** Ширина белого поля в модулях. Четыре — требование стандарта. */
  quietZone?: number
  level?: EccLevel
  /** Подпись для тех, кто читает экран голосом. */
  alt: string
  className?: string
}

export function Qr({ value, size = 180, quietZone = 4, level = 'M', alt, className }: QrProps) {
  const code = encodeQr(value, level)
  const side = code.size + quietZone * 2

  // Один путь вместо сотен прямоугольников: разметка короче в разы,
  // а браузеру нечего склеивать при отрисовке.
  let path = ''
  for (let row = 0; row < code.size; row += 1) {
    for (let col = 0; col < code.size; col += 1) {
      if (!code.modules[row]![col]) continue
      path += `M${col + quietZone} ${row + quietZone}h1v1h-1z`
    }
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${side} ${side}`}
      role="img"
      aria-label={alt}
      shapeRendering="crispEdges"
    >
      <rect width={side} height={side} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}

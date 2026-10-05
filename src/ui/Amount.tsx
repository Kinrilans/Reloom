import styles from './Amount.module.css'

/**
 * Показ денежной суммы.
 *
 * ВАЖНО. Компонент НИЧЕГО НЕ СЧИТАЕТ и ничего не форматирует. Он получает
 * уже готовую строку и только раскрашивает её: приглушает дробную часть и
 * ставит код валюты. Разделение целой и дробной части — разрез строки по
 * последней точке ради начертания, а не разбор числа.
 *
 * Арифметики над деньгами здесь нет и не будет: на этапе прототипа все суммы
 * приходят константами из фикстур, а в продукте строку готовит общий хелпер
 * форматирования на границе UI (docs/domain-and-money.md). Любой расчёт,
 * заехавший в этот файл, переживёт прототип и всплывёт на реальных деньгах.
 */

export type AmountSize = 'display' | 'kpi' | 'body' | 'caption'

export interface AmountProps {
  /** Готовая строка из фикстуры, например «1 234.56» или «-23.40». */
  value: string
  /** Код валюты после числа, например «USD». */
  currency?: string
  size?: AmountSize
  /** Сумма лежит на фирменной плашке — приглушение берётся от её цвета. */
  onBrand?: boolean
  /** Операция отменена или отклонена: сумма зачёркивается. */
  struck?: boolean
  className?: string
}

export function Amount({
  value,
  currency,
  size = 'body',
  onBrand = false,
  struck = false,
  className,
}: AmountProps) {
  const split = value.lastIndexOf('.')
  const whole = split === -1 ? value : value.slice(0, split)
  const fraction = split === -1 ? null : value.slice(split)

  const classes = [
    styles.amount,
    styles[size],
    onBrand ? styles.onBrand : null,
    struck ? styles.struck : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes}>
      <span>
        {whole}
        {fraction ? <span className={styles.fraction}>{fraction}</span> : null}
      </span>
      {currency ? <span className={styles.currency}>{currency}</span> : null}
    </span>
  )
}

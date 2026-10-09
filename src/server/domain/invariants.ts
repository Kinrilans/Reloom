/**
 * Инварианты платёжеспособности.
 *
 * Два правила, которые нельзя отключать ради прохождения теста
 * (CLAUDE.md, «Чего не делать»). Оба проверяются при выпуске карты и
 * при любом изменении лимита, а не только фоновой сверкой: сверка
 * находит нарушение после того, как деньги уже выданы.
 */

import type { Minor } from '@/shared/money'
import { remainingOf, type CardMoney } from './limits'

export class InvariantError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'InvariantError'
    this.code = code
  }
}

/**
 * Правило 4: сумма остатков по картам пользователя ≤ его баланс.
 *
 * Без этой проверки человек потратит свои деньги столько раз, сколько
 * у него карт: каждая карта разрешает тратить независимо.
 *
 * Считаются только живые карты. Отменённая не может ничего потратить,
 * а её остаток по определению ноль.
 */
export function checkUserSolvency(balance: Minor, cards: CardMoney[]): void {
  const allocated = sumRemaining(cards)
  if (allocated > balance) {
    throw new InvariantError(
      'USER_OVERALLOCATED',
      `Сумма остатков по картам (${allocated}) больше баланса пользователя (${balance})`,
    )
  }
}

/**
 * Правило 5: сумма остатков по картам пользователей компании ≤ её пул.
 *
 * **В разрезе компании, а не по холдингу целиком.** У каждой компании
 * свой залог в Oxen, и пул одной не покрывает карты другой. Проверка
 * «по всем сразу» пропустит состояние, где у одной компании избыток,
 * а у второй карты уже отказывают.
 *
 * Oxen проверяет залог компании РАНЬШЕ лимита карты. Если выдано
 * лимитов больше, чем есть в пуле, карты начнут отказывать в случайном
 * порядке — кто первый потратил, тот и успел.
 */
export function checkCompanySolvency(poolAvailable: Minor, cards: CardMoney[]): void {
  const allocated = sumRemaining(cards)
  if (allocated > poolAvailable) {
    throw new InvariantError(
      'COMPANY_OVERALLOCATED',
      `Сумма остатков по картам компании (${allocated}) больше её пула (${poolAvailable})`,
    )
  }
}

/** Сумма остатков. Отрицательные остатки входят как есть: минус — это
 *  реальное состояние карты, прятать его нулём нельзя. */
export function sumRemaining(cards: CardMoney[]): Minor {
  return cards.reduce<Minor>((total, card) => total + remainingOf(card), 0n)
}

/**
 * Покрытие пула: насколько оборотного капитала больше, чем выдано.
 *
 * Возвращается в базисных пунктах, а не в процентах с дробью: проценты
 * пришлось бы считать в плавающей точке, а это число показывается рядом
 * с деньгами и сравнивается с порогами.
 *
 * Когда выдано ноль, покрытие не определено: делить не на что.
 */
export function coverageBps(poolAvailable: Minor, cards: CardMoney[]): number | null {
  const allocated = sumRemaining(cards)
  if (allocated <= 0n) return null
  return Number(((poolAvailable - allocated) * 10_000n) / allocated)
}

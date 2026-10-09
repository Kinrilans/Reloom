/**
 * Лимит карты.
 *
 * Самое важное место домена. Лимит в Oxen — это **потолок, а не
 * остаток**. При трате он не меняется: растёт внутренний счётчик
 * потраченного, который не сбрасывается никогда за всю жизнь карты.
 *
 *   остаток = appliedLimit − потрачено
 *
 * Выставили 600, потратил 100 → лимит всё ещё 600, потрачено 100,
 * остаток 500. Понизить лимит до 500 нельзя: тогда остаток станет 400,
 * потраченное вычтется дважды.
 *
 * Отсюда единственно верная формула изменения:
 *
 *   новый_лимит = потрачено + желаемый_остаток
 *
 * Любой код вида `новый_лимит = старый_лимит + сумма` — баг, выдающий
 * пользователю лишние деньги (CLAUDE.md, правило 3).
 */

import type { Minor } from '@/shared/money'

export class LimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LimitError'
  }
}

/**
 * Состояние карты, от которого считается всё остальное.
 *
 * Потраченное разложено на две части нарочно. Oxen считает потраченным
 * и то и другое, но для нас это разные вещи: осевшие траты необратимы,
 * а резерв под незакрытые авторизации когда-нибудь освободится — и
 * именно по нему решается, можно ли отменить карту.
 */
export interface CardMoney {
  /** Подтверждённый Oxen потолок. */
  appliedLimit: Minor
  /** Осевшие траты минус возвраты. */
  settled: Minor
  /** Незакрытые авторизации: одобрено, но ещё не списано. */
  pending: Minor
}

/**
 * Потрачено по карте — так, как это считает Oxen: завершённые траты
 * плюс одобренные, но ещё не списанные авторизации.
 */
export function spentOf(card: CardMoney): Minor {
  return card.settled + card.pending
}

/**
 * Остаток по карте.
 *
 * Может быть отрицательным: списание выше одобренного (курсовая
 * разница, чаевые, поздний счёт) — штатный путь в перерасход, и
 * прятать его нулём нельзя. Минус должен дойти до баланса и заморозить
 * карты, а не потеряться здесь.
 */
export function remainingOf(card: CardMoney): Minor {
  return card.appliedLimit - spentOf(card)
}

/**
 * Сколько с карты можно унести: при переводе на другую карту, при
 * закрытии, при выводе.
 *
 * Равно остатку, и это не совпадение: резерв под незакрытые
 * авторизации уже вычтен внутри `spentOf`. Отдельного вычитания здесь
 * быть не должно — иначе резерв вычтется дважды.
 *
 * Отрицательный остаток означает, что уносить нечего: вернётся ноль.
 */
export function freeToMove(card: CardMoney): Minor {
  const remaining = remainingOf(card)
  return remaining > 0n ? remaining : 0n
}

/**
 * Новый потолок под желаемый остаток.
 *
 * Желаемый остаток отрицательным быть не может: это была бы попытка
 * выставить карте долг.
 */
export function limitForRemaining(card: CardMoney, desiredRemaining: Minor): Minor {
  if (desiredRemaining < 0n) {
    throw new LimitError('Желаемый остаток не может быть отрицательным')
  }
  return spentOf(card) + desiredRemaining
}

/**
 * Новый потолок после зачисления `amount` на карту.
 *
 * Остаток берётся **как есть, вместе с минусом**. Карта в минусе
 * сначала гасит его и только потом получает свободные деньги. Если
 * взять здесь `freeToMove` (он обрезан нулём), человеку подарится
 * величина долга: при остатке −5 и зачислении 10 на карте оказалось бы
 * 10 вместо 5, а баланс вырос бы только на 5. Инвариант «сумма
 * остатков ≤ баланс» ловит это сразу, но ловить тут уже поздно —
 * правильнее не создавать.
 */
export function limitAfterCredit(card: CardMoney, amount: Minor): Minor {
  if (amount < 0n) {
    throw new LimitError('Зачисляемая сумма не может быть отрицательной')
  }
  return spentOf(card) + (remainingOf(card) + amount)
}

/** Новый потолок после снятия `amount` с карты. */
export function limitAfterDebit(card: CardMoney, amount: Minor): Minor {
  if (amount < 0n) {
    throw new LimitError('Снимаемая сумма не может быть отрицательной')
  }
  const free = freeToMove(card)
  if (amount > free) {
    throw new LimitError(
      `С карты нельзя снять больше свободного остатка: просят ${amount}, свободно ${free}`,
    )
  }
  return limitForRemaining(card, free - amount)
}

/**
 * Можно ли отменять карту.
 *
 * Два условия, и оба обязательны. Остаток ноль — деньги с карты унесены.
 * Резерва нет — не осталось одобренных операций, которые осядут позже.
 *
 * Если отменить карту с живым резервом, осевшая позже авторизация уведёт
 * её в минус, за ней баланс пользователя, и заморозятся все его карты.
 * Отмена в Oxen необратима, откатить это будет нечем.
 */
export function cancelBlockers(card: CardMoney): string[] {
  const blockers: string[] = []
  if (remainingOf(card) !== 0n) blockers.push('REMAINING_NOT_ZERO')
  if (card.pending !== 0n) blockers.push('PENDING_AUTHORIZATIONS')
  return blockers
}

export function canCancel(card: CardMoney): boolean {
  return cancelBlockers(card).length === 0
}

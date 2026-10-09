/**
 * Комиссии.
 *
 * Две независимые ставки — пополнения и вывода. Каждая задаётся
 * глобально и может быть переопределена на пользователя.
 *
 * **Индивидуальная ставка ЗАМЕНЯЕТ глобальную, а не складывается
 * с ней.** Это написано прямо в интерфейсе админки и обязано быть
 * правдой в коде: сложение дало бы человеку с индивидуальной ставкой
 * комиссию вдвое больше объявленной.
 *
 * Ставка фиксируется в проводке в момент применения (`feeBpsUsed`).
 * Изменение глобальной ставки прошлые операции не пересчитывает.
 */

import { applyBps, type Minor } from '@/shared/money'

export class FeeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeeError'
  }
}

/**
 * Ставка: доля в базисных пунктах, фиксированная часть и минимум.
 *
 * Минимум нужен затем, что процент с мелкой суммы даёт копейки, а
 * работы по ней столько же. Поле необязательное: отсутствующий минимум
 * означает «нижней границы нет», и это не то же самое, что минимум
 * ноль, — просто оба считаются одинаково.
 */
export interface FeeRate {
  bps: number
  fixedMinor: Minor
  minMinor?: Minor
}

export interface FeeBreakdown {
  /** Сумма до удержания. */
  grossMinor: Minor
  /** Удержано нами. */
  feeMinor: Minor
  /** Дошло до пользователя. */
  netMinor: Minor
  /** Ставка, по которой считали. Уходит в проводку. */
  bpsUsed: number
}

/**
 * Какая ставка применяется: индивидуальная, если задана, иначе
 * глобальная.
 *
 * `null` и `undefined` означают «индивидуальной нет». Ноль
 * индивидуальной ставкой БЫВАЕТ — это «для этого человека комиссии
 * нет», и подменять его глобальной нельзя.
 */
export function effectiveBps(globalBps: number, individualBps: number | null | undefined): number {
  return individualBps ?? globalBps
}

/**
 * Расчёт комиссии.
 *
 * Доля округляется вверх (`src/shared/money.ts`): неполная копейка
 * достаётся нам.
 *
 * Комиссия никогда не превышает саму сумму — иначе нетто уходит в минус
 * и пополнение превращается в списание. Если фиксированная часть больше
 * пришедшего, удерживаем всё пришедшее и зачисляем ноль.
 */
export function calcFee(
  grossMinor: Minor,
  rate: FeeRate,
  individualBps?: number | null,
): FeeBreakdown {
  if (grossMinor < 0n) {
    throw new FeeError('Комиссия считается от неотрицательной суммы')
  }
  if (rate.fixedMinor < 0n) {
    throw new FeeError('Фиксированная часть комиссии не может быть отрицательной')
  }

  const bpsUsed = effectiveBps(rate.bps, individualBps)
  const raw = withMinimum(applyBps(grossMinor, bpsUsed) + rate.fixedMinor, rate.minMinor)
  const feeMinor = raw > grossMinor ? grossMinor : raw

  return {
    grossMinor,
    feeMinor,
    netMinor: grossMinor - feeMinor,
    bpsUsed,
  }
}

/**
 * Сколько всего спишется с баланса при выводе `amount` на руки.
 *
 * При выводе комиссия берётся СВЕРХ суммы: человек получает ровно то,
 * что просил, а с баланса уходит больше. На пополнении наоборот —
 * комиссия внутри пришедшего. Перепутать эти два случая означает
 * ошибиться на величину комиссии в каждой операции.
 */
export function calcWithdrawalCharge(
  amountMinor: Minor,
  rate: FeeRate,
  individualBps?: number | null,
): FeeBreakdown {
  if (amountMinor < 0n) {
    throw new FeeError('Сумма вывода не может быть отрицательной')
  }
  const bpsUsed = effectiveBps(rate.bps, individualBps)
  const feeMinor = withMinimum(applyBps(amountMinor, bpsUsed) + rate.fixedMinor, rate.minMinor)
  return {
    grossMinor: amountMinor + feeMinor,
    feeMinor,
    netMinor: amountMinor,
    bpsUsed,
  }
}

/**
 * Поднять комиссию до минимума, если она его не достала.
 *
 * Минимум **не складывается** с процентом и фиксированной частью, а
 * заменяет их, когда те меньше: иначе ставка «1% и не меньше двух
 * долларов» превратилась бы в «1% плюс два доллара».
 */
function withMinimum(fee: Minor, minMinor: Minor | undefined): Minor {
  if (minMinor === undefined || minMinor <= 0n) return fee
  return fee < minMinor ? minMinor : fee
}

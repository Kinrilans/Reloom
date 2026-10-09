/**
 * Чистый домен: формулы и правила без базы.
 *
 * Номера в названиях — из списка обязательных тестов
 * (`docs/domain-and-money.md`). Часть из них здесь проверяется на
 * формулах, а в `tests/ledger.test.ts` — на настоящей базе: формула
 * может быть верной, а запись в базу всё равно двойной.
 */

import { describe, expect, it } from 'vitest'
import { applyBps, formatMinor, formatMoney, parseMinor, MoneyError } from '@/shared/money'
import {
  canCancel,
  cancelBlockers,
  freeToMove,
  limitAfterCredit,
  limitAfterDebit,
  limitForRemaining,
  remainingOf,
  spentOf,
  LimitError,
  type CardMoney,
} from '@/server/domain/limits'
import { calcFee, calcWithdrawalCharge, effectiveBps } from '@/server/domain/fees'
import {
  checkCompanySolvency,
  checkUserSolvency,
  coverageBps,
  InvariantError,
  sumRemaining,
} from '@/server/domain/invariants'
import { assertBalanced, depositEntries, spendEntries, withdrawalEntries, LedgerError } from '@/server/ledger'
import { has, requireRight, RightsError } from '@/server/services/rights'

const card = (appliedLimit: bigint, settled = 0n, pending = 0n): CardMoney => ({
  appliedLimit,
  settled,
  pending,
})

describe('деньги', () => {
  it('разбирает и собирает суммы без плавающей точки', () => {
    expect(parseMinor('1234.56')).toBe(123456n)
    expect(parseMinor('0.29')).toBe(29n) // через Number здесь выходило 28.99…
    expect(parseMinor('-12.40')).toBe(-1240n)
    expect(parseMinor('1 234.56')).toBe(123456n)
    expect(parseMinor('100')).toBe(10000n)
  })

  it('не принимает то, что суммой не является', () => {
    expect(() => parseMinor('1.234')).toThrow(MoneyError)
    expect(() => parseMinor('abc')).toThrow(MoneyError)
    expect(() => parseMinor('')).toThrow(MoneyError)
  })

  it('формат один во всех языках', () => {
    expect(formatMinor(123456n)).toBe('1 234.56')
    expect(formatMinor(-1240n)).toBe('-12.40')
    expect(formatMoney(10000n)).toBe('100.00 USD')
  })

  it('доля в базисных пунктах округляется вверх, в нашу пользу', () => {
    // 33.33 × 1.5% = 0.49995 → удерживаем 0.50, а не 0.49.
    expect(applyBps(3333n, 150)).toBe(50n)
    // Ровное значение округлением не трогается: 100.00 × 1.5% = 1.50.
    expect(applyBps(10000n, 150)).toBe(150n)
    // Копейка комиссии берётся даже с суммы, где доля почти нулевая.
    expect(applyBps(1n, 1)).toBe(1n)
    // А с нуля комиссии нет: округлять нечего.
    expect(applyBps(0n, 150)).toBe(0n)
  })
})

describe('лимит карты', () => {
  it('№1: трата не уменьшает потолок, остаток считается вычитанием', () => {
    // Выставили 600, потратил 100.
    const c = card(60000n, 10000n)
    expect(c.appliedLimit).toBe(60000n) // потолок не тронут
    expect(spentOf(c)).toBe(10000n)
    expect(remainingOf(c)).toBe(50000n)

    // Понижать потолок до остатка нельзя: потраченное вычлось бы дважды.
    const wrong = card(50000n, 10000n)
    expect(remainingOf(wrong)).toBe(40000n)
  })

  it('№1: новый потолок считается как потрачено + желаемый остаток', () => {
    const c = card(60000n, 10000n)
    expect(limitForRemaining(c, 50000n)).toBe(60000n)
    expect(limitAfterCredit(c, 50000n)).toBe(110000n)
    expect(limitAfterDebit(c, 20000n)).toBe(40000n)
  })

  it('№2: внёс 600, потратил 100, внёс 500 → потолок 1100', () => {
    let c = card(60000n, 10000n) // внесли 600, потратили 100
    const next = limitAfterCredit(c, 50000n) // внесли ещё 500
    expect(next).toBe(110000n) // не 1000 и не 1600
    c = card(next, 10000n)
    expect(remainingOf(c)).toBe(100000n) // доступно ровно 1000
  })

  it('№7: незакрытая авторизация уменьшает доступное', () => {
    const c = card(60000n, 10000n, 5000n)
    expect(spentOf(c)).toBe(15000n)
    expect(remainingOf(c)).toBe(45000n)
    // Резерв уже внутри остатка, второй раз его вычитать нельзя.
    expect(freeToMove(c)).toBe(45000n)
  })

  it('№15: карта с резервом не отменяется', () => {
    expect(canCancel(card(10000n, 10000n, 0n))).toBe(true)
    expect(cancelBlockers(card(10000n, 5000n, 0n))).toContain('REMAINING_NOT_ZERO')
    // Остаток ноль, но резерв жив — отменять нельзя.
    expect(cancelBlockers(card(15000n, 10000n, 5000n))).toEqual(['PENDING_AUTHORIZATIONS'])
  })

  it('не даёт унести больше свободного и выставить отрицательный остаток', () => {
    expect(() => limitAfterDebit(card(10000n, 0n), 20000n)).toThrow(LimitError)
    expect(() => limitForRemaining(card(10000n), -1n)).toThrow(LimitError)
  })

  it('зачисление на карту в минусе сначала гасит минус', () => {
    // Потолок 100, потрачено 105 → остаток −5. Зачисляем 10.
    const c = card(10000n, 10500n)
    expect(remainingOf(c)).toBe(-500n)

    const next = limitAfterCredit(c, 1000n)
    expect(next - spentOf(c)).toBe(500n) // на карте 5, а не 10

    // Если бы остаток обрезали нулём, человек получил бы 10 при росте
    // баланса на 5 — то есть величину долга в подарок.
    expect(limitForRemaining(c, freeToMove(c) + 1000n) - spentOf(c)).toBe(1000n)
  })

  it('минус на карте не прячется нулём', () => {
    // Списание выше одобренного: курсовая разница, чаевые, поздний счёт.
    expect(remainingOf(card(10000n, 12000n))).toBe(-2000n)
    expect(freeToMove(card(10000n, 12000n))).toBe(0n) // уносить нечего
  })
})

describe('комиссии', () => {
  it('№8: индивидуальная ставка заменяет глобальную, а не складывается', () => {
    expect(effectiveBps(150, null)).toBe(150)
    expect(effectiveBps(150, 50)).toBe(50) // не 200
    expect(effectiveBps(150, 0)).toBe(0) // ноль — это ставка, а не «не задано»
  })

  it('№8: пополнение и вывод считаются раздельно и по-разному', () => {
    const deposit = calcFee(100000n, { bps: 150, fixedMinor: 200n })
    // На пополнении комиссия ВНУТРИ пришедшего.
    expect(deposit.feeMinor).toBe(1700n)
    expect(deposit.netMinor).toBe(98300n)
    expect(deposit.grossMinor).toBe(100000n)

    const withdrawal = calcWithdrawalCharge(100000n, { bps: 150, fixedMinor: 200n })
    // На выводе — СВЕРХ суммы: на руки ровно столько, сколько просили.
    expect(withdrawal.netMinor).toBe(100000n)
    expect(withdrawal.feeMinor).toBe(1700n)
    expect(withdrawal.grossMinor).toBe(101700n)
  })

  it('комиссия не съедает больше пришедшего', () => {
    const fee = calcFee(100n, { bps: 150, fixedMinor: 500n })
    expect(fee.feeMinor).toBe(100n)
    expect(fee.netMinor).toBe(0n) // но не минус
  })

  it('ставка, по которой считали, возвращается для записи в проводку', () => {
    expect(calcFee(10000n, { bps: 150, fixedMinor: 0n }, 50).bpsUsed).toBe(50)
  })
})

describe('инварианты', () => {
  it('№5: сумма остатков по картам не превышает баланс', () => {
    const cards = [card(60000n, 10000n), card(30000n)]
    expect(sumRemaining(cards)).toBe(80000n)
    expect(() => checkUserSolvency(80000n, cards)).not.toThrow()
    expect(() => checkUserSolvency(79999n, cards)).toThrow(InvariantError)
  })

  it('№6: пул проверяется по своей компании, а не по всем сразу', () => {
    const alpha = [card(100000n)]
    const beta = [card(100000n)]

    // По холдингу целиком всё сходится: 200 000 выдано, 200 000 в пулах.
    const totalPool = 150000n + 50000n
    expect(sumRemaining([...alpha, ...beta])).toBe(totalPool)

    // А по компаниям — нет: у второй выдано вдвое больше, чем есть.
    expect(() => checkCompanySolvency(150000n, alpha)).not.toThrow()
    expect(() => checkCompanySolvency(50000n, beta)).toThrow(InvariantError)
  })

  it('покрытие считается в базисных пунктах, без плавающей точки', () => {
    expect(coverageBps(120000n, [card(100000n)])).toBe(2000) // +20%
    expect(coverageBps(90000n, [card(100000n)])).toBe(-1000) // −10%, карты скоро откажут
    expect(coverageBps(100000n, [])).toBeNull() // делить не на что
  })
})

describe('леджер: записи', () => {
  it('№11: сумма записей проводки равна нулю', () => {
    expect(() => assertBalanced(depositEntries('u1', 98300n, 1700n))).not.toThrow()
    expect(() => assertBalanced(spendEntries('u1', 4999n))).not.toThrow()
    expect(() => assertBalanced(withdrawalEntries('u1', 100000n, 1700n))).not.toThrow()

    expect(() =>
      assertBalanced([
        { account: 'USER:u1', amountMinor: 100n },
        { account: 'EXTERNAL', amountMinor: -99n },
      ]),
    ).toThrow(LedgerError)
  })

  it('пополнение без комиссии не плодит пустую запись', () => {
    expect(depositEntries('u1', 10000n, 0n)).toHaveLength(2)
    expect(depositEntries('u1', 9900n, 100n)).toHaveLength(3)
  })
})

describe('права операторов', () => {
  const plain = { id: 'op1', rights: ['MANAGE_USERS'], isSuperAdmin: false, isActive: true }

  it('№12: без права нельзя ни корректировать баланс, ни выводить', () => {
    expect(has(plain, 'ADJUST_BALANCE')).toBe(false)
    expect(has(plain, 'WITHDRAW')).toBe(false)
    expect(() => requireRight(plain, 'WITHDRAW')).toThrow(RightsError)
  })

  it('главный администратор обладает всеми правами', () => {
    const boss = { id: 'op0', rights: [], isSuperAdmin: true, isActive: true }
    expect(has(boss, 'GRANT_RIGHTS')).toBe(true)
  })

  it('отключённый оператор не может ничего, даже если права записаны', () => {
    const fired = { id: 'op2', rights: ['WITHDRAW'], isSuperAdmin: true, isActive: false }
    expect(has(fired, 'WITHDRAW')).toBe(false)
  })
})

/**
 * Вывод средств и ручная корректировка баланса.
 *
 * Оба действия доступны только оператору с соответствующим правом, оба
 * обязательно попадают в аудит, и оба уменьшают деньги пользователя —
 * то есть ошибка здесь стоит дороже всего.
 *
 * **Система не исполняет перевод.** Она списывает баланс и освобождает
 * лимиты; фактическая выдача средств происходит вне платформы,
 * вручную. Создавать впечатление, что деньги ушли, нельзя.
 */

import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import type { Minor } from '@/shared/money'
import { calcWithdrawalCharge, type FeeRate } from '../domain/fees'
import { freeToMove, limitForRemaining } from '../domain/limits'
import type { CardLimitPort } from '../domain/ports'
import { adjustmentEntries, post, userBalance, withdrawalEntries } from '../ledger'
import { money, syncFreezeWithBalance } from './cards'
import { requireRight, type ActingOperator } from './rights'

export class WithdrawalError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'WithdrawalError'
    this.code = code
  }
}

export interface WithdrawalResult {
  ledgerTransactionId: string
  /** Выдаётся на руки. */
  netMinor: Minor
  feeMinor: Minor
  /** Списано с баланса: нетто плюс комиссия. */
  totalMinor: Minor
}

/**
 * Вывод.
 *
 * Комиссия берётся **сверх** суммы: человек получает ровно то, что
 * просил, а с баланса уходит больше. На пополнении наоборот — там она
 * внутри пришедшего.
 */
export async function withdraw(
  prisma: PrismaClient,
  port: CardLimitPort,
  operator: ActingOperator,
  input: { userId: string; amountMinor: Minor; withdrawalId: string; reason?: string },
): Promise<WithdrawalResult> {
  requireRight(operator, 'WITHDRAW')

  if (input.amountMinor <= 0n) {
    throw new WithdrawalError('BAD_AMOUNT', 'Сумма вывода должна быть положительной')
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId } })
    if (!user) throw new WithdrawalError('USER_NOT_FOUND', `Пользователя ${input.userId} нет`)

    const settings = await tx.settings.findUnique({ where: { id: 'singleton' } })
    if (!settings) throw new WithdrawalError('NO_SETTINGS', 'Настройки не заведены')

    // Минимум вывода — проверка блокирующая, в отличие от минимума
    // пополнения: там деньги уже пришли, здесь ещё ничего не ушло.
    if (input.amountMinor < settings.minWithdrawalMinor) {
      throw new WithdrawalError(
        'BELOW_MINIMUM',
        `Минимальная сумма вывода ${settings.minWithdrawalMinor}`,
      )
    }

    const rate: FeeRate = {
      bps: settings.withdrawalFeeBps,
      fixedMinor: settings.withdrawalFeeFixedMinor,
      minMinor: settings.withdrawalFeeMinMinor,
    }
    const charge = calcWithdrawalCharge(input.amountMinor, rate, user.withdrawalFeeBps)

    const balance = await userBalance(tx, user.id)
    if (charge.grossMinor > balance) {
      throw new WithdrawalError(
        'INSUFFICIENT_FUNDS',
        `На балансе ${balance}, требуется ${charge.grossMinor} с учётом комиссии`,
      )
    }

    // Сначала освобождаем лимиты, потом пишем проводку. Обратный
    // порядок на мгновение оставил бы сумму лимитов больше баланса —
    // то самое состояние, которое запрещено инвариантом.
    await releaseFromCards(tx, port, user.id, charge.grossMinor)

    const posted = await post(tx, {
      type: 'WITHDRAWAL',
      companyId: user.companyId,
      userId: user.id,
      sourceType: 'WITHDRAWAL',
      sourceId: input.withdrawalId,
      operatorId: operator.id,
      reason: input.reason,
      feeBpsUsed: charge.bpsUsed,
      entries: withdrawalEntries(user.id, charge.netMinor, charge.feeMinor),
    })

    await syncFreezeWithBalance(tx, user.id)

    return {
      ledgerTransactionId: posted.id,
      netMinor: charge.netMinor,
      feeMinor: charge.feeMinor,
      totalMinor: charge.grossMinor,
    }
  })
}

export interface WithdrawalPreview {
  netMinor: Minor
  feeMinor: Minor
  totalMinor: Minor
  bpsUsed: number
  minWithdrawalMinor: Minor
  belowMinimum: boolean
  balanceMinor: Minor
  /** Денег на балансе не хватает на сумму вместе с комиссией. */
  insufficient: boolean
}

/**
 * Что получится при выводе.
 *
 * Считает **тем же кодом**, что и сам вывод. Отдельный расчёт «для
 * показа» однажды разойдётся с настоящим, и оператор пообещает
 * человеку одну сумму, а с баланса уйдёт другая.
 */
export async function previewWithdrawal(
  prisma: PrismaClient,
  input: { userId: string; amountMinor: Minor },
): Promise<WithdrawalPreview> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } })
  if (!user) throw new WithdrawalError('USER_NOT_FOUND', `Пользователя ${input.userId} нет`)

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } })
  if (!settings) throw new WithdrawalError('NO_SETTINGS', 'Настройки не заведены')

  const rate: FeeRate = {
    bps: settings.withdrawalFeeBps,
    fixedMinor: settings.withdrawalFeeFixedMinor,
    minMinor: settings.withdrawalFeeMinMinor,
  }
  const charge = calcWithdrawalCharge(input.amountMinor, rate, user.withdrawalFeeBps)
  const balance = await userBalance(prisma, user.id)

  return {
    netMinor: charge.netMinor,
    feeMinor: charge.feeMinor,
    totalMinor: charge.grossMinor,
    bpsUsed: charge.bpsUsed,
    minWithdrawalMinor: settings.minWithdrawalMinor,
    belowMinimum: input.amountMinor < settings.minWithdrawalMinor,
    balanceMinor: balance,
    insufficient: charge.grossMinor > balance,
  }
}

/**
 * Снять нужную сумму с карт: сначала с дочерних, потом с главной.
 *
 * Порядок такой, потому что главная играет роль счёта: с неё идут
 * пополнения и на неё возвращаются остатки, и опустошать её последней
 * — меньше всего лишних движений.
 *
 * Резерв под незакрытые авторизации не трогается: он уже вычтен внутри
 * свободного остатка.
 */
async function releaseFromCards(
  tx: Prisma.TransactionClient,
  port: CardLimitPort,
  userId: string,
  amountMinor: Minor,
): Promise<void> {
  const cards = await tx.card.findMany({
    where: { userId, status: { in: ['ACTIVE', 'FROZEN', 'CLOSING'] } },
    orderBy: [{ isPrimary: 'asc' }, { createdAt: 'asc' }],
  })

  let left = amountMinor
  for (const card of cards) {
    if (left === 0n) break
    const free = freeToMove(money(card))
    if (free === 0n) continue
    const take = free < left ? free : left
    const newLimit = limitForRemaining(money(card), free - take)
    await port.setLimit(card.oxenCardId, newLimit)
    await tx.card.update({ where: { id: card.id }, data: { appliedLimit: newLimit } })
    left -= take
  }

  // Остаток мог лежать нераспределённым — это нормально. Не
  // нормально — если денег не хватило: значит баланс и карты
  // разошлись, и списывать дальше нельзя.
  if (left < 0n) {
    throw new WithdrawalError('INCONSISTENT', 'С карт снято больше запрошенного')
  }
}

/**
 * Ручная корректировка баланса.
 *
 * Отдельное право, обязательная причина, запись в аудит. Лимиты карт
 * она не трогает: корректировка меняет баланс, а распределение по
 * картам остаётся на усмотрение пользователя.
 *
 * Корректировка в минус может увести баланс ниже суммы остатков по
 * картам — это запрещено инвариантом, и такая попытка отклоняется.
 */
export async function adjustBalance(
  prisma: PrismaClient,
  operator: ActingOperator,
  input: { userId: string; deltaMinor: Minor; reason: string; adjustmentId: string },
): Promise<{ ledgerTransactionId: string; balanceMinor: Minor }> {
  requireRight(operator, 'ADJUST_BALANCE')

  if (input.deltaMinor === 0n) {
    throw new WithdrawalError('BAD_AMOUNT', 'Корректировка на ноль ничего не меняет')
  }
  if (input.reason.trim() === '') {
    throw new WithdrawalError('NO_REASON', 'Корректировка баланса требует причины')
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId } })
    if (!user) throw new WithdrawalError('USER_NOT_FOUND', `Пользователя ${input.userId} нет`)

    const posted = await post(tx, {
      type: 'ADJUSTMENT',
      companyId: user.companyId,
      userId: user.id,
      sourceType: 'ADJUSTMENT',
      sourceId: input.adjustmentId,
      operatorId: operator.id,
      reason: input.reason,
      entries: adjustmentEntries(user.id, input.deltaMinor),
    })

    const balance = await userBalance(tx, user.id)
    const cards = await tx.card.findMany({
      where: { userId: user.id, status: { in: ['ACTIVE', 'FROZEN', 'CLOSING'] } },
    })
    const allocated = cards.reduce<Minor>(
      (sum, card) => sum + (card.appliedLimit - card.settledMinor - card.pendingMinor),
      0n,
    )
    if (allocated > balance) {
      throw new WithdrawalError(
        'WOULD_BREAK_INVARIANT',
        `После корректировки остатки по картам (${allocated}) превысили бы баланс (${balance})`,
      )
    }

    await syncFreezeWithBalance(tx, user.id)
    return { ledgerTransactionId: posted.id, balanceMinor: balance }
  })
}

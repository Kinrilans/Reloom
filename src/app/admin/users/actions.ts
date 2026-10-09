'use server'

/**
 * Действия над пользователями.
 *
 * Все права проверяются здесь, на сервере. Интерфейс прячет кнопки,
 * которых у оператора нет, но запрос уходит и мимо кнопки.
 *
 * Оператор **нигде не вводит абсолютное значение лимита карты**. Он
 * вводит «зачислить», «вывести», «выделить на карту», а потолок
 * считает код по формуле `потрачено + остаток` (CLAUDE.md, правила 2
 * и 3).
 */

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { acting, requireOperator } from '@/server/auth'
import { writeAudit } from '@/server/audit'
import { prisma } from '@/server/db/client'
import { oxen } from '@/server/deps'
import { limitPort } from '@/server/oxen/ports'
import { formatMinor, parseMinor } from '@/shared/money'
import { freezeCard, issueCard } from '@/server/services/cardAdmin'
import { LIVE_STATUSES } from '@/server/services/cards'
import { requireRight } from '@/server/services/rights'
import {
  blockUser,
  createCardholder,
  createUser,
  resetSecondFactor,
  setIndividualFees,
  unblockUser,
} from '@/server/services/users'
import { adjustBalance, previewWithdrawal, withdraw } from '@/server/services/withdrawals'

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string }

export async function createUserAction(input: {
  companyId: string
  fullName: string
  email: string
}): Promise<Result<{ userId: string }>> {
  const operator = await requireOperator()
  try {
    const result = await createUser(prisma, acting(operator), input)
    revalidatePath('/admin/users')
    return { ok: true, userId: result.userId }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Завести пользователя у эмитента.
 *
 * Статус отображается честно: «на проверке», а не «готово».
 * Одобрение приходит событием, иногда через сутки, и карты до него
 * выпускать нельзя.
 */
export async function createCardholderAction(userId: string): Promise<Result<{ status: string }>> {
  const operator = await requireOperator()
  try {
    const result = await createCardholder(prisma, oxen(), acting(operator), userId)
    revalidatePath('/admin/users')
    return { ok: true, status: result.status }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Выпустить карту.
 *
 * Сумма — «сколько выделить с нераспределённого остатка», а не
 * потолок. У новой карты они совпадают, но совпадают один раз: после
 * первой траты потолок уже выше доступного.
 */
export async function issueCardAction(input: {
  userId: string
  amount: string
}): Promise<Result<{ cardId: string; last4: string }>> {
  const operator = await requireOperator()
  let allocateMinor: bigint
  try {
    allocateMinor = parseMinor(input.amount)
  } catch {
    return { ok: false, error: 'BAD_AMOUNT' }
  }

  try {
    const result = await issueCard(prisma, oxen(), acting(operator), {
      userId: input.userId,
      allocateMinor,
    })
    revalidateAll()
    return { ok: true, cardId: result.cardId, last4: result.last4 }
  } catch (error) {
    return fail(error)
  }
}

/** Заморозить все живые карты пользователя. */
export async function freezeAllCardsAction(userId: string): Promise<Result<{ frozen: number }>> {
  const operator = await requireOperator()
  requireRight(acting(operator), 'MANAGE_USERS')

  const cards = await prisma.card.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { id: true },
  })
  try {
    for (const card of cards) {
      await freezeCard(prisma, oxen(), acting(operator), card.id)
    }
    revalidateAll()
    return { ok: true, frozen: cards.length }
  } catch (error) {
    return fail(error)
  }
}

export async function withdrawPreviewAction(input: {
  userId: string
  amount: string
}): Promise<
  | {
      ok: true
      fee: string
      total: string
      net: string
      bps: number
      belowMinimum: boolean
      minWithdrawal: string
      insufficient: boolean
    }
  | { ok: false; error: string }
> {
  const operator = await requireOperator()
  requireRight(acting(operator), 'WITHDRAW')

  let amountMinor: bigint
  try {
    amountMinor = parseMinor(input.amount)
  } catch {
    return { ok: false, error: 'BAD_AMOUNT' }
  }
  if (amountMinor <= 0n) return { ok: false, error: 'BAD_AMOUNT' }

  const preview = await previewWithdrawal(prisma, { userId: input.userId, amountMinor })
  return {
    ok: true,
    fee: formatMinor(preview.feeMinor),
    total: formatMinor(preview.totalMinor),
    net: formatMinor(preview.netMinor),
    bps: preview.bpsUsed,
    belowMinimum: preview.belowMinimum,
    minWithdrawal: formatMinor(preview.minWithdrawalMinor),
    insufficient: preview.insufficient,
  }
}

/**
 * Вывод средств.
 *
 * Система **не исполняет перевод**. Она уменьшает баланс и освобождает
 * лимиты; выдача средств происходит вне платформы, вручную. Поэтому
 * и формулировка на экране: «баланс уменьшен, выдайте средства».
 */
export async function withdrawAction(input: {
  userId: string
  amount: string
  reason?: string
}): Promise<Result<{ net: string; fee: string; total: string }>> {
  const operator = await requireOperator()

  let amountMinor: bigint
  try {
    amountMinor = parseMinor(input.amount)
  } catch {
    return { ok: false, error: 'BAD_AMOUNT' }
  }

  try {
    const result = await withdraw(prisma, limitPort(oxen()), acting(operator), {
      userId: input.userId,
      amountMinor,
      // Идентификатор операции — наш ключ идемпотентности в леджере:
      // два нажатия кнопки дадут две разные операции, и это верно
      // (вывели дважды), а повтор одного запроса — нет.
      withdrawalId: randomUUID(),
      ...(input.reason ? { reason: input.reason } : {}),
    })

    const user = await prisma.user.findUnique({ where: { id: input.userId } })
    await writeAudit(prisma, {
      operatorId: operator.id,
      action: 'WITHDRAWN',
      targetType: 'USER',
      targetId: input.userId,
      targetName: user?.fullName,
      companyId: user?.companyId,
      ...(input.reason ? { reason: input.reason } : {}),
      after: {
        net: result.netMinor,
        fee: result.feeMinor,
        total: result.totalMinor,
        ledgerTransactionId: result.ledgerTransactionId,
      },
    })

    revalidateAll()
    return {
      ok: true,
      net: formatMinor(result.netMinor),
      fee: formatMinor(result.feeMinor),
      total: formatMinor(result.totalMinor),
    }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Ручная корректировка баланса.
 *
 * Единственная операция, создающая деньги из воздуха. Отдельное
 * право, обязательная причина, яркая отметка в аудите.
 */
export async function adjustAction(input: {
  userId: string
  /** Со знаком: «-120.00» уменьшает баланс. */
  amount: string
  reason: string
}): Promise<Result<{ balance: string }>> {
  const operator = await requireOperator()

  let deltaMinor: bigint
  try {
    deltaMinor = parseMinor(input.amount)
  } catch {
    return { ok: false, error: 'BAD_AMOUNT' }
  }
  if (input.reason.trim() === '') return { ok: false, error: 'NO_REASON' }

  try {
    const result = await adjustBalance(prisma, acting(operator), {
      userId: input.userId,
      deltaMinor,
      reason: input.reason,
      adjustmentId: randomUUID(),
    })

    const user = await prisma.user.findUnique({ where: { id: input.userId } })
    await writeAudit(prisma, {
      operatorId: operator.id,
      action: 'BALANCE_ADJUSTED',
      targetType: 'USER',
      targetId: input.userId,
      targetName: user?.fullName,
      companyId: user?.companyId,
      reason: input.reason,
      after: { delta: deltaMinor, balance: result.balanceMinor },
    })

    revalidateAll()
    return { ok: true, balance: formatMinor(result.balanceMinor) }
  } catch (error) {
    return fail(error)
  }
}

export async function blockAction(input: {
  userId: string
  reason: string
}): Promise<Result<{ frozenCards: number }>> {
  const operator = await requireOperator()
  try {
    const result = await blockUser(prisma, oxen(), acting(operator), input)
    revalidateAll()
    return { ok: true, frozenCards: result.frozenCards }
  } catch (error) {
    return fail(error)
  }
}

export async function unblockAction(userId: string): Promise<Result<{ unfrozenCards: number }>> {
  const operator = await requireOperator()
  try {
    const result = await unblockUser(prisma, oxen(), acting(operator), userId)
    revalidateAll()
    return { ok: true, unfrozenCards: result.unfrozenCards }
  } catch (error) {
    return fail(error)
  }
}

export async function resetSecondFactorAction(userId: string): Promise<Result> {
  const operator = await requireOperator()
  try {
    await resetSecondFactor(prisma, acting(operator), userId)
    revalidatePath('/admin/users')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/** Индивидуальные ставки. Пустая строка означает «берётся
 *  глобальная», ноль — «комиссии нет»: это разные вещи. */
export async function setFeesAction(input: {
  userId: string
  depositBps: string
  withdrawalBps: string
  reason?: string
}): Promise<Result> {
  const operator = await requireOperator()

  const parse = (value: string): number | null | undefined => {
    if (value.trim() === '') return null
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
  }
  const deposit = parse(input.depositBps)
  const withdrawal = parse(input.withdrawalBps)
  if (deposit === undefined || withdrawal === undefined) {
    return { ok: false, error: 'BAD_RATE' }
  }

  try {
    await setIndividualFees(prisma, acting(operator), {
      userId: input.userId,
      depositFeeBps: deposit,
      withdrawalFeeBps: withdrawal,
      ...(input.reason ? { reason: input.reason } : {}),
    })
    revalidatePath('/admin/users')
    revalidatePath('/admin/settings/fees')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/** Сколько живых карт у пользователя — для подсказки про слоты. */
export async function liveCardCountAction(userId: string): Promise<number> {
  await requireOperator()
  return prisma.card.count({ where: { userId, status: { in: [...LIVE_STATUSES] } } })
}

function revalidateAll(): void {
  revalidatePath('/admin/users')
  revalidatePath('/admin/cards')
  revalidatePath('/admin')
}

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

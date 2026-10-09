'use server'

/**
 * Действия над заявками на пополнение.
 *
 * Подтверждение — самое ответственное действие в админке, и защита от
 * двойного зачисления стоит **здесь и ниже**, а не в интерфейсе:
 *
 *   * захват заявки (claim) с отметкой кто и когда, протухающий по
 *     таймауту;
 *   * оптимистическая блокировка по версии записи;
 *   * переход статуса только из `SUBMITTED` или `HELD`;
 *   * уникальный индекс в леджере по источнику проводки.
 *
 * Пометка «заявку разбирает такой-то» в интерфейсе — удобство. Если
 * убрать её, двое операторов просто не узнают друг о друге; если
 * убрать проверки ниже — зачислят деньги дважды.
 */

import { revalidatePath } from 'next/cache'
import { acting, requireOperator } from '@/server/auth'
import { writeAudit } from '@/server/audit'
import { prisma } from '@/server/db/client'
import { oxen, wallet } from '@/server/deps'
import { limitPort } from '@/server/oxen/ports'
import { parseMinor } from '@/shared/money'
import {
  claimDeposit,
  confirmDeposit,
  markRefunded,
  rejectDeposit,
  type RejectReason,
} from '@/server/services/deposits'
import { previewForUser } from '@/server/admin/settings'
import { requireRight } from '@/server/services/rights'
import { sendRefundOnce } from '@/server/wallet/ports'
import { formatMinor } from '@/shared/money'

/**
 * Захватить заявку.
 *
 * Экран **не перерисовывается** после захвата нарочно. Пометка «кого
 * разбирает» нужна другим операторам и появится при их следующем
 * чтении списка; а обновление страницы под руками у того, кто только
 * что открыл заявку, сбрасывало бы введённую сумму и закрывало бы
 * окно подтверждения.
 */
export async function claimAction(depositId: string) {
  const operator = await requireOperator()
  requireRight(acting(operator), 'APPROVE_DEPOSITS')
  return claimDeposit(prisma, depositId, operator.id)
}

/**
 * Пересчитать удержание и итог.
 *
 * Считает **тем же кодом**, что и зачисление. Отдельный расчёт
 * «только для показа» однажды разойдётся с настоящим, и оператор
 * подтвердит одну сумму, а зачислится другая.
 */
export async function previewAction(input: {
  depositId: string
  received: string
  overrideBps?: string
}) {
  const operator = await requireOperator()
  requireRight(acting(operator), 'APPROVE_DEPOSITS')

  const deposit = await prisma.depositRequest.findUnique({
    where: { id: input.depositId },
    select: { userId: true },
  })
  if (!deposit) return { error: 'NOT_FOUND' as const }

  let grossMinor: bigint
  try {
    grossMinor = parseMinor(input.received)
  } catch {
    return { error: 'BAD_AMOUNT' as const }
  }
  if (grossMinor <= 0n) return { error: 'BAD_AMOUNT' as const }

  const override = input.overrideBps === undefined ? undefined : Number(input.overrideBps)
  if (override !== undefined && (!Number.isInteger(override) || override < 0)) {
    return { error: 'BAD_RATE' as const }
  }

  return {
    preview: await previewForUser(prisma, {
      userId: deposit.userId,
      grossMinor,
      ...(override === undefined ? {} : { feeBpsOverride: override }),
    }),
  }
}

export type ConfirmOutcome =
  | { ok: true; credited: string; fee: string; alreadyCredited: boolean }
  | { ok: false; error: string }

export async function confirmAction(input: {
  depositId: string
  /** Фактически полученная сумма: приходит столько, сколько пришло. */
  received: string
  overrideBps?: string
  reason?: string
}): Promise<ConfirmOutcome> {
  const operator = await requireOperator()
  requireRight(acting(operator), 'APPROVE_DEPOSITS')

  let receivedMinor: bigint
  try {
    receivedMinor = parseMinor(input.received)
  } catch {
    return { ok: false, error: 'BAD_AMOUNT' }
  }

  const override =
    input.overrideBps === undefined || input.overrideBps === ''
      ? undefined
      : Number(input.overrideBps)

  try {
    const result = await confirmDeposit(prisma, limitPort(oxen()), {
      requestId: input.depositId,
      operatorId: operator.id,
      receivedMinor,
      ...(override === undefined ? {} : { feeBpsOverride: override }),
      ...(input.reason ? { reason: input.reason } : {}),
    })

    // В аудит пишем после проводки и только если она наша: повтор по
    // уже зачисленной заявке ничего не создал, и запись о нём
    // выглядела бы как второе зачисление.
    if (!result.alreadyCredited) {
      const deposit = await prisma.depositRequest.findUnique({
        where: { id: input.depositId },
        include: { user: { select: { fullName: true, companyId: true } } },
      })
      await writeAudit(prisma, {
        operatorId: operator.id,
        action: 'DEPOSIT_CREDITED',
        targetType: 'DEPOSIT',
        targetId: input.depositId,
        targetName: deposit?.user.fullName,
        companyId: deposit?.user.companyId,
        ...(input.reason ? { reason: input.reason } : {}),
        after: {
          received: receivedMinor,
          fee: result.feeMinor,
          net: result.netMinor,
          ledgerTransactionId: result.ledgerTransactionId,
          ...(override === undefined ? {} : { feeBpsOverride: override }),
        },
      })
    }

    revalidate()
    return {
      ok: true,
      credited: formatMinor(result.netMinor),
      fee: formatMinor(result.feeMinor),
      alreadyCredited: result.alreadyCredited,
    }
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}

export async function rejectAction(input: {
  depositId: string
  reasonCode: string
  comment?: string
  lang?: string
}): Promise<{ ok: boolean; error?: string }> {
  const operator = await requireOperator()
  requireRight(acting(operator), 'APPROVE_DEPOSITS')

  try {
    const result = await rejectDeposit(prisma, {
      requestId: input.depositId,
      operatorId: operator.id,
      reasonCode: input.reasonCode as RejectReason,
      ...(input.comment ? { reasonText: input.comment } : {}),
      ...(input.lang ? { reasonLang: input.lang } : {}),
    })

    if (!result.alreadyRejected) {
      const deposit = await prisma.depositRequest.findUnique({
        where: { id: input.depositId },
        include: { user: { select: { fullName: true, companyId: true } } },
      })
      await writeAudit(prisma, {
        operatorId: operator.id,
        action: 'DEPOSIT_REJECTED',
        targetType: 'DEPOSIT',
        targetId: input.depositId,
        targetName: deposit?.user.fullName,
        companyId: deposit?.user.companyId,
        reasonCode: input.reasonCode,
        ...(input.comment ? { reason: input.comment } : {}),
      })
    }

    revalidate()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}

/**
 * Возврат отправителю.
 *
 * Обычно его запускает сам пользователь: средства в систему не
 * зачислялись, в леджере их нет, а получатель ровно один — адрес,
 * с которого они пришли. Оператору кнопка оставлена на один случай:
 * пользователь не отвечает, а деньги висят на адресе.
 *
 * **Отправка денег не повторяется.** Повтор отправит их дважды,
 * поэтому у вызова свой идемпотентный ключ, записанный до отправки
 * (`src/server/wallet`), а неоднозначный ответ выясняется чтением.
 */
export async function refundAction(
  depositId: string,
): Promise<{ ok: boolean; error?: string }> {
  const operator = await requireOperator()
  requireRight(acting(operator), 'APPROVE_DEPOSITS')

  const deposit = await prisma.depositRequest.findUnique({
    where: { id: depositId },
    include: { user: { select: { fullName: true, companyId: true } } },
  })
  if (!deposit) return { ok: false, error: 'NOT_FOUND' }
  if (!deposit.chainTxId || !deposit.fromAddress) {
    return { ok: false, error: 'NO_SENDER' }
  }

  try {
    const sent = await sendRefundOnce(wallet(), prisma, deposit.id, {
      chainTxId: deposit.chainTxId,
      toAddress: deposit.fromAddress,
    })
    // Неоднозначный ответ НЕ повторяем: деньги могли уйти. Заявка
    // остаётся удержанной, а разбирается чтением (`resolveRefund`).
    if (sent.unresolved) return { ok: false, error: sent.error ?? 'UNRESOLVED' }

    await markRefunded(prisma, deposit.id)

    await writeAudit(prisma, {
      operatorId: operator.id,
      action: 'REFUND_SENT',
      targetType: 'DEPOSIT',
      targetId: deposit.id,
      targetName: deposit.user.fullName,
      companyId: deposit.user.companyId,
      after: { toAddress: deposit.fromAddress, addressBurned: true },
    })

    revalidate()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}

function revalidate(): void {
  revalidatePath('/admin/deposits')
  revalidatePath('/admin/users')
  revalidatePath('/admin')
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

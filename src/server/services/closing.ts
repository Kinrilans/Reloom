/**
 * Закрытие карты — только через заморозку.
 *
 * Отмена в Oxen необратима, заморозка обратима. Поэтому карта никогда
 * не отменяется одним действием:
 *
 *   1. `CLOSING` — заморожена и помечена к закрытию. Новые авторизации
 *      не проходят, операция ещё обратима.
 *   2. Перенос остатка — только свободной части.
 *   3. Отмена — **только** при нулевом остатке и пустом резерве.
 *
 * Резерв под незакрытые авторизации переносить нельзя. Если перенести
 * всё и авторизация осядет позже, карта уйдёт в минус, за ней баланс
 * пользователя, и заморозятся все его карты. Ради предотвращения
 * именно этого закрытие и делается через заморозку.
 */

import { Prisma, type PrismaClient } from '@/generated/prisma/client'
import type { Minor } from '@/shared/money'
import { cancelBlockers, freeToMove } from '../domain/limits'
import type { CardIssuePort, CardLimitPort, CardStatePort } from '../domain/ports'
import { money } from './cards'
import { transfer } from './transfers'

export class ClosingError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ClosingError'
    this.code = code
  }
}

/**
 * Куда уходит остаток закрываемой карты.
 *
 * Выбор делается ПРИ переводе в `CLOSING`, до начала переносов: решать
 * посреди процесса — значит оставить деньги висеть, пока человек
 * думает.
 *
 * Для дочерней карты выбора нет: остаток уходит на главную.
 */
export type ClosingPlan =
  | { kind: 'TO_CARD'; cardId: string }
  | { kind: 'ISSUE_NEW' }

export async function startClosing(
  prisma: PrismaClient,
  state: CardStatePort,
  input: { cardId: string; plan: ClosingPlan },
): Promise<void> {
  const card = await prisma.card.findUnique({ where: { id: input.cardId } })
  if (!card) throw new ClosingError('CARD_NOT_FOUND', `Карты ${input.cardId} нет`)
  if (card.status === 'CANCELED') {
    throw new ClosingError('CARD_TERMINAL', 'Карта уже отменена, отмена необратима')
  }

  // Заморозка идёт первой: пока карта принимает новые авторизации,
  // остаток продолжает меняться и перенести его нельзя.
  await state.freeze(card.oxenCardId)
  await prisma.card.update({
    where: { id: card.id },
    data: { status: 'CLOSING', freezeReason: 'CLOSING', closingPlan: input.plan },
  })
}

/** Вернуть карту в работу, пока она не отменена. */
export async function cancelClosing(
  prisma: PrismaClient,
  state: CardStatePort,
  cardId: string,
): Promise<void> {
  const card = await prisma.card.findUnique({ where: { id: cardId } })
  if (!card) throw new ClosingError('CARD_NOT_FOUND', `Карты ${cardId} нет`)
  if (card.status !== 'CLOSING') {
    throw new ClosingError('NOT_CLOSING', 'Карта не закрывается')
  }
  await state.unfreeze(card.oxenCardId)
  await prisma.card.update({
    where: { id: cardId },
    // Prisma различает «поле пустое» и «в поле записан JSON null»;
    // нам нужно первое.
    data: { status: 'ACTIVE', freezeReason: null, closingPlan: Prisma.DbNull },
  })
}

export interface ClosingProgress {
  movedMinor: Minor
  /** Что мешает отменить карту прямо сейчас. Пусто — можно отменять. */
  blockers: string[]
  canceled: boolean
}

/**
 * Продвинуть закрытие: перенести свободную часть и, если больше ничего
 * не держит, отменить карту.
 *
 * Вызывается и сразу после `startClosing`, и фоновым процессом по мере
 * оседания операций. Безопасна к повтору.
 *
 * Если новая карта не выпустилась — остаток остаётся на закрываемой,
 * **она не отменяется**, наверх уходит ошибка. Отменить карту, не
 * вынув из неё деньги, означает потерять их безвозвратно.
 */
export async function advanceClosing(
  prisma: PrismaClient,
  ports: { limit: CardLimitPort; state: CardStatePort; issue: CardIssuePort },
  cardId: string,
): Promise<ClosingProgress> {
  const card = await prisma.card.findUnique({ where: { id: cardId }, include: { user: true } })
  if (!card) throw new ClosingError('CARD_NOT_FOUND', `Карты ${cardId} нет`)
  if (card.status === 'CANCELED') {
    return { movedMinor: 0n, blockers: [], canceled: true }
  }
  if (card.status !== 'CLOSING') {
    throw new ClosingError('NOT_CLOSING', 'Карта не закрывается')
  }

  const plan = (card.closingPlan ?? null) as ClosingPlan | null
  if (!plan) throw new ClosingError('NO_PLAN', 'Не выбрано, куда переносить остаток')

  const free = freeToMove(money(card))
  let moved = 0n

  if (free > 0n) {
    const targetId = await resolveTarget(prisma, ports.issue, card.userId, plan, card.id)
    const result = await transfer(prisma, ports.limit, {
      userId: card.userId,
      fromCardId: card.id,
      toCardId: targetId,
      amountMinor: free,
    })
    if (result.status !== 'COMPLETED') {
      throw new ClosingError(
        'TRANSFER_INCOMPLETE',
        `Остаток не перенесён (${result.status}): ${result.error ?? 'без подробностей'}`,
      )
    }
    moved = free
  }

  const fresh = await prisma.card.findUniqueOrThrow({ where: { id: cardId } })
  const blockers = cancelBlockers(money(fresh))
  if (blockers.length > 0) {
    // Карта висит в `CLOSING` и ждёт, пока осядут операции. Это не
    // ошибка и не тупик: резерв освободится сам.
    return { movedMinor: moved, blockers, canceled: false }
  }

  await ports.state.cancel(fresh.oxenCardId)
  await prisma.card.update({
    where: { id: cardId },
    data: { status: 'CANCELED', freezeReason: null },
  })
  return { movedMinor: moved, blockers: [], canceled: true }
}

/**
 * Куда переносить: на существующую карту или на свежевыпущенную.
 *
 * Выпуск новой карты может не получиться. Тогда исключение уходит
 * наверх, и закрываемая карта остаётся как есть — с деньгами и
 * в статусе `CLOSING`.
 */
async function resolveTarget(
  prisma: PrismaClient,
  issue: CardIssuePort,
  userId: string,
  plan: ClosingPlan,
  closingCardId: string,
): Promise<string> {
  if (plan.kind === 'TO_CARD') {
    const target = await prisma.card.findUnique({ where: { id: plan.cardId } })
    if (!target || target.userId !== userId) {
      throw new ClosingError('TARGET_NOT_FOUND', 'Карты-получателя нет')
    }
    if (target.status !== 'ACTIVE' && target.status !== 'FROZEN') {
      throw new ClosingError('TARGET_NOT_LIVE', 'Карта-получатель не в работе')
    }
    return target.id
  }

  const closing = await prisma.card.findUniqueOrThrow({
    where: { id: closingCardId },
    include: { user: true },
  })
  const cardholderId = closing.user.oxenCardholderId
  if (!cardholderId) {
    throw new ClosingError('NO_CARDHOLDER', 'У пользователя нет картхолдера у эмитента')
  }

  // Новая карта выпускается с нулевым потолком: деньги на неё придут
  // переводом, одной и той же дорогой со всеми остальными.
  const issued = await issue.issueCard({ oxenCardholderId: cardholderId, limitMinor: 0n })
  const created = await prisma.card.create({
    data: {
      userId,
      oxenCardId: issued.oxenCardId,
      last4: issued.last4,
      isPrimary: closing.isPrimary,
      status: 'ACTIVE',
      appliedLimit: 0n,
    },
  })

  // Главной остаётся ровно одна карта: новая забирает роль у той,
  // которую закрывают.
  if (closing.isPrimary) {
    await prisma.card.update({ where: { id: closingCardId }, data: { isPrimary: false } })
  }
  return created.id
}

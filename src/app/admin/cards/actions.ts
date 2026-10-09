'use server'

/**
 * Действия над картами.
 *
 * Прямой отмены здесь нет и быть не может. Отмена в Oxen необратима,
 * поэтому карта закрывается только через заморозку: `CLOSING`, перенос
 * остатка, и лишь при нулевом остатке и пустом резерве — отмена
 * (CLAUDE.md, правило 3c).
 *
 * Изменения лимита тоже нет: лимит производен от распределения,
 * которое делает пользователь (docs/flows-admin.md, п. 4).
 */

import { revalidatePath } from 'next/cache'
import { acting, requireOperator } from '@/server/auth'
import { prisma } from '@/server/db/client'
import { oxen } from '@/server/deps'
import { issuePort, limitPort, statePort } from '@/server/oxen/ports'
import { formatMinor } from '@/shared/money'
import {
  closeCard,
  freezeCard,
  refreshCard,
  reopenCard,
  unfreezeCard,
} from '@/server/services/cardAdmin'
import { advanceClosing, type ClosingPlan } from '@/server/services/closing'

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string }

export async function freezeAction(cardId: string): Promise<Result> {
  const operator = await requireOperator()
  try {
    await freezeCard(prisma, oxen(), acting(operator), cardId)
    revalidate()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function unfreezeAction(cardId: string): Promise<Result> {
  const operator = await requireOperator()
  try {
    await unfreezeCard(prisma, oxen(), acting(operator), cardId)
    revalidate()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Закрыть карту.
 *
 * План переноса остатка выбирается **сразу**, до начала переноса:
 * решать посреди процесса значит оставить деньги висеть, пока человек
 * думает.
 *
 * Сразу после перевода в `CLOSING` закрытие продвигается на один шаг:
 * свободная часть уходит по плану, и если ничего больше не держит,
 * карта отменяется. Что мешает — возвращается наверх и показывается.
 */
export async function closeAction(input: {
  cardId: string
  /** Идентификатор карты-получателя или пусто — выпустить новую. */
  toCardId?: string
}): Promise<Result<{ moved: string; blockers: string[]; canceled: boolean }>> {
  const operator = await requireOperator()
  const plan: ClosingPlan =
    input.toCardId && input.toCardId !== ''
      ? { kind: 'TO_CARD', cardId: input.toCardId }
      : { kind: 'ISSUE_NEW' }

  try {
    await closeCard(prisma, oxen(), acting(operator), { cardId: input.cardId, plan })
    const progress = await advanceClosing(
      prisma,
      {
        limit: limitPort(oxen()),
        state: statePort(oxen()),
        // Выпуск новой карты — создающий вызов, и у него свой
        // идемпотентный ключ, привязанный к закрываемой карте:
        // повтор не выпустит вторую.
        issue: issuePort(oxen(), prisma, `closing:${input.cardId}`),
      },
      input.cardId,
    )
    revalidate()
    return {
      ok: true,
      moved: formatMinor(progress.movedMinor),
      blockers: progress.blockers,
      canceled: progress.canceled,
    }
  } catch (error) {
    return fail(error)
  }
}

export async function reopenAction(cardId: string): Promise<Result> {
  const operator = await requireOperator()
  try {
    await reopenCard(prisma, oxen(), acting(operator), cardId)
    revalidate()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Перечитать карту у эмитента.
 *
 * Расхождения не прячем: подтверждённый эмитентом потолок главнее
 * нашего представления о нём, и видно, изменилось ли что-то.
 */
export async function rereadAction(
  cardId: string,
): Promise<Result<{ status: string; applied: string; changed: boolean }>> {
  await requireOperator()
  try {
    const result = await refreshCard(prisma, oxen(), cardId)
    revalidate()
    return {
      ok: true,
      status: result.status,
      applied: formatMinor(result.appliedLimit),
      changed: result.changed,
    }
  } catch (error) {
    return fail(error)
  }
}

function revalidate(): void {
  revalidatePath('/admin/cards')
  revalidatePath('/admin/users')
  revalidatePath('/admin')
}

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

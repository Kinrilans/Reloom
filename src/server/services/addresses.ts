/**
 * Крипто-адреса пользователей.
 *
 * Адрес выдаётся **конкретному** пользователю и закрепляется за ним.
 * Общего адреса «на всех» нет и быть не может: по поступлению на такой
 * адрес невозможно отличить, чей это платёж, а значит невозможно и
 * зачислить его без человека.
 *
 * Уничтоженный адрес из реестра **не удаляется**: поступления по нему
 * остаются в истории. Пользователь при следующем пополнении заводит
 * новый.
 */

import type { PrismaClient } from '@/generated/prisma/client'
import { writeAudit } from '../audit'
import { requireRight, type ActingOperator } from './rights'

export class AddressError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AddressError'
    this.code = code
  }
}

/** Почему адрес уничтожен. Код, а не текст (CLAUDE.md, правило 3e). */
export const BURN_REASONS = ['REFUNDED', 'COMPROMISED'] as const
export type BurnReason = (typeof BURN_REASONS)[number]

/**
 * Уничтожить адрес.
 *
 * Два случая: после возврата отправителю (это делает сама система)
 * и руками оператора, если адрес скомпрометирован. Право отдельное —
 * `MANAGE_ADDRESSES`: ошибка с адресом означает деньги, ушедшие
 * в никуда, а название сети или комиссию можно поправить.
 */
export async function burnAddress(
  prisma: PrismaClient,
  operator: ActingOperator,
  input: { addressId: string; reason: BurnReason },
): Promise<void> {
  requireRight(operator, 'MANAGE_ADDRESSES')
  if (!BURN_REASONS.includes(input.reason)) {
    throw new AddressError('BAD_REASON', `Неизвестная причина: ${input.reason}`)
  }

  const address = await prisma.depositAddress.findUnique({
    where: { id: input.addressId },
    include: { user: true, network: true },
  })
  if (!address) throw new AddressError('NOT_FOUND', `Адреса ${input.addressId} нет`)
  if (address.status === 'BURNED') return

  await prisma.depositAddress.update({
    where: { id: address.id },
    data: { status: 'BURNED', burnReason: input.reason, burnedAt: new Date() },
  })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'ADDRESS_BURNED',
    targetType: 'ADDRESS',
    // В аудит уходит идентификатор, а в подпись — усечённый адрес:
    // полный адрес в списке событий читать невозможно, а искать
    // по нему всё равно будут по началу и концу.
    targetId: address.id,
    targetName: shortAddress(address.address),
    companyId: address.user.companyId,
    reasonCode: input.reason,
    before: { status: 'ACTIVE' },
    after: { status: 'BURNED', reason: input.reason },
  })
}

export function shortAddress(address: string): string {
  if (address.length <= 14) return address
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

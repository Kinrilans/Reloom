/**
 * Вывод средств и ручная корректировка баланса.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { RightsError } from '@/server/services/rights'
import { adjustBalance, withdraw, WithdrawalError } from '@/server/services/withdrawals'
import { registerIncoming } from '@/server/services/deposits'
import {
  addCard,
  addOperator,
  balanceOf,
  fakeLimitPort,
  prisma,
  remainingOfCard,
  resetDb,
  seed,
} from './helpers'

beforeEach(resetDb)
afterAll(async () => {
  await prisma.$disconnect()
})

const PASSED = { amlVerdict: 'PASSED' as const, amlRisk: 5 }

async function funded(options: Parameters<typeof seed>[0] = {}, amount = 100000n) {
  const seeded = await seed(options)
  const primary = await addCard({ userId: seeded.userId, isPrimary: true })
  await registerIncoming(prisma, fakeLimitPort(), {
    chainTxId: 'tx-fund',
    addressId: seeded.addressId,
    receivedMinor: amount,
    ...PASSED,
  })
  return { ...seeded, primary }
}

const acting = (rights: string[], isSuperAdmin = false) => ({
  id: 'op-1',
  rights,
  isSuperAdmin,
  isActive: true,
})

describe('вывод средств', () => {
  it('№8: комиссия вывода берётся сверх суммы и считается своей ставкой', async () => {
    const { userId, primary } = await funded({
      depositFeeBps: 150, // на вывод не влияет
      withdrawalFeeBps: 100,
      withdrawalFeeFixedMinor: 200n,
    })
    // Пополнение удержало свою комиссию отдельно.
    expect(await balanceOf(userId)).toBe(98500n)

    const port = fakeLimitPort()
    const result = await withdraw(prisma, port, acting(['WITHDRAW']), {
      userId,
      amountMinor: 50000n,
      withdrawalId: 'w-1',
    })

    // На руки ровно столько, сколько просили.
    expect(result.netMinor).toBe(50000n)
    expect(result.feeMinor).toBe(700n) // 1% + 2.00
    expect(result.totalMinor).toBe(50700n)

    expect(await balanceOf(userId)).toBe(98500n - 50700n)
    expect(await remainingOfCard(primary)).toBe(98500n - 50700n)
  })

  it('№12: без права WITHDRAW вывод невозможен', async () => {
    const { userId } = await funded()
    await expect(
      withdraw(prisma, fakeLimitPort(), acting(['MANAGE_USERS']), {
        userId,
        amountMinor: 1000n,
        withdrawalId: 'w-1',
      }),
    ).rejects.toThrow(RightsError)

    expect(await balanceOf(userId)).toBe(100000n) // ничего не произошло
    expect(await prisma.ledgerTransaction.count({ where: { type: 'WITHDRAWAL' } })).toBe(0)
  })

  it('№12: без права ADJUST_BALANCE корректировка невозможна', async () => {
    const { userId } = await funded()
    await expect(
      adjustBalance(prisma, acting(['WITHDRAW']), {
        userId,
        deltaMinor: 100000n,
        reason: 'подарок себе',
        adjustmentId: 'a-1',
      }),
    ).rejects.toThrow(RightsError)
    expect(await balanceOf(userId)).toBe(100000n)
  })

  it('право, выданное точечно, работает; главный администратор может всё', async () => {
    const { userId } = await funded()
    const operator = await addOperator(['WITHDRAW'])

    const result = await withdraw(
      prisma,
      fakeLimitPort(),
      { id: operator.id, rights: operator.rights, isSuperAdmin: false, isActive: true },
      { userId, amountMinor: 1000n, withdrawalId: 'w-1' },
    )
    expect(result.netMinor).toBe(1000n)

    const boss = await addOperator([], true)
    const second = await withdraw(
      prisma,
      fakeLimitPort(),
      { id: boss.id, rights: [], isSuperAdmin: true, isActive: true },
      { userId, amountMinor: 1000n, withdrawalId: 'w-2' },
    )
    expect(second.netMinor).toBe(1000n)
  })

  it('нельзя вывести больше, чем есть с учётом комиссии', async () => {
    const { userId } = await funded({ withdrawalFeeBps: 100 })
    await expect(
      withdraw(prisma, fakeLimitPort(), acting(['WITHDRAW']), {
        userId,
        amountMinor: 100000n, // ровно баланс, но комиссия сверху
        withdrawalId: 'w-1',
      }),
    ).rejects.toThrow(WithdrawalError)
    expect(await balanceOf(userId)).toBe(100000n)
  })

  it('минимум вывода — проверка блокирующая', async () => {
    const { userId } = await funded({ minWithdrawalMinor: 10000n })
    await expect(
      withdraw(prisma, fakeLimitPort(), acting(['WITHDRAW']), {
        userId,
        amountMinor: 9999n,
        withdrawalId: 'w-1',
      }),
    ).rejects.toThrow(WithdrawalError)
  })

  it('повторный вывод с тем же идентификатором не списывает дважды', async () => {
    const { userId } = await funded()
    const input = { userId, amountMinor: 1000n, withdrawalId: 'w-1' }

    await withdraw(prisma, fakeLimitPort(), acting(['WITHDRAW']), input)
    await withdraw(prisma, fakeLimitPort(), acting(['WITHDRAW']), input)

    expect(await prisma.ledgerTransaction.count({ where: { type: 'WITHDRAWAL' } })).toBe(1)
    expect(await balanceOf(userId)).toBe(99000n)
  })
})

describe('ручная корректировка', () => {
  it('требует причины и не принимает ноль', async () => {
    const { userId } = await funded()
    const operator = acting(['ADJUST_BALANCE'])

    await expect(
      adjustBalance(prisma, operator, { userId, deltaMinor: 0n, reason: 'так', adjustmentId: 'a-1' }),
    ).rejects.toThrow(WithdrawalError)
    await expect(
      adjustBalance(prisma, operator, { userId, deltaMinor: 100n, reason: '  ', adjustmentId: 'a-2' }),
    ).rejects.toThrow(WithdrawalError)
  })

  it('корректировка в минус не может увести баланс ниже выданных лимитов', async () => {
    const { userId } = await funded()
    const operator = acting(['ADJUST_BALANCE'])

    // На карте лежит весь баланс. Срезать баланс, не тронув лимиты,
    // означало бы дать потратить несуществующие деньги.
    await expect(
      adjustBalance(prisma, operator, {
        userId,
        deltaMinor: -50000n,
        reason: 'ошибка зачисления',
        adjustmentId: 'a-1',
      }),
    ).rejects.toThrow(WithdrawalError)

    expect(await balanceOf(userId)).toBe(100000n)
    expect(await prisma.ledgerTransaction.count({ where: { type: 'ADJUSTMENT' } })).toBe(0)
  })

  it('корректировка в плюс проходит и пишет причину в проводку', async () => {
    const { userId } = await funded()
    const result = await adjustBalance(prisma, acting(['ADJUST_BALANCE']), {
      userId,
      deltaMinor: 5000n,
      reason: 'компенсация комиссии сети',
      adjustmentId: 'a-1',
    })

    expect(result.balanceMinor).toBe(105000n)
    const tx = await prisma.ledgerTransaction.findFirstOrThrow({ where: { type: 'ADJUSTMENT' } })
    expect(tx.reason).toBe('компенсация комиссии сети')
    expect(tx.operatorId).toBe('op-1')
  })
})

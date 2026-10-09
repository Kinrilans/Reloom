/**
 * Дымовой прогон: трата по карте.
 *
 * Зеркалит операцию теми же функциями, которыми её применяет
 * обработчик событий: авторизация ставит резерв, оседание пишет
 * проводку. Отдельный скрипт нужен потому, что заглушка эмитента
 * держит состояние в памяти своего процесса, и «подложить» в неё
 * транзакцию снаружи нельзя.
 *
 *     pnpm tsx scripts/dev-spend.ts <last4> <сумма>
 */

import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/server/db/client'
import { applyAuthorization, applySettlement } from '../src/server/services/mirror'
import { parseMinor } from '../src/shared/money'

async function main(): Promise<void> {
  const last4 = process.argv[2] ?? ''
  const amount = parseMinor(process.argv[3] ?? '124.00')
  const merchant = process.argv[4] ?? 'SQ *COFFEE SHOP 4411'

  const card = await prisma.card.findFirstOrThrow({ where: { last4 } })
  const id = randomUUID()

  await applyAuthorization(prisma, {
    id,
    cardId: card.id,
    amountMinor: amount,
    merchantName: merchant,
    occurredAt: new Date(),
  })
  await applySettlement(prisma, { id, settledMinor: amount, occurredAt: new Date() })

  console.log(`трата ${process.argv[3]} по карте •••• ${last4} зеркалирована`)
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())

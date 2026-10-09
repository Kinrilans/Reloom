/**
 * Код второго фактора для дымового прогона.
 *
 * Нужен только в разработке: в жизни код берут из приложения
 * на телефоне, а здесь его неоткуда взять. Секрет читается из базы
 * и в вывод не попадает.
 */

import 'dotenv/config'
import { prisma } from '../src/server/db/client'
import { totpNow } from '../src/server/auth/totp'

async function main(): Promise<void> {
  const email = (process.argv[2] ?? '').trim().toLowerCase()
  const operator = await prisma.operator.findFirstOrThrow({ where: { email } })
  if (!operator.totpSecret) throw new Error('второй фактор ещё не настроен')
  console.log(totpNow(operator.totpSecret))
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())

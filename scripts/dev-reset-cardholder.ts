/**
 * Сбросить привязку картхолдера после перезапуска заглушки.
 *
 * Заглушка эмитента держит состояние в памяти процесса: после
 * перезапуска dev-сервера записанный у нас `chd_…` указывает в пустоту,
 * и выпуск карты честно падает с «картхолдер не найден». В разработке
 * это лечится повторным заведением, в проде такого не бывает.
 */

import 'dotenv/config'
import { prisma } from '../src/server/db/client'

async function main(): Promise<void> {
  const email = (process.argv[2] ?? '').trim().toLowerCase()
  const user = await prisma.user.findFirstOrThrow({ where: { email } })

  await prisma.user.update({
    where: { id: user.id },
    data: { oxenCardholderId: null, oxenStatus: null },
  })
  await prisma.outboundIntent.deleteMany({
    where: { operation: 'CREATE_CARDHOLDER', subjectId: user.id },
  })

  console.log(`Привязка сброшена: ${email}. Заведите заново из карточки пользователя.`)
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())

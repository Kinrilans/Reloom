/**
 * Проверка, что база поднята и мы в неё попадаем.
 *
 * Отдельной командой, а не тестом: тест не должен требовать запущенного
 * докера, иначе `pnpm test` перестанет быть зелёным на машине, где база
 * не поднята, и перестанет что-либо значить.
 *
 *   pnpm db:check
 */

// Next читает .env сам, а tsx — нет: без этой строки процесс
// стартует без DATABASE_URL.
import 'dotenv/config'

import { prisma } from '../src/server/db/client'

async function main(): Promise<void> {
  const [row] = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`
  console.log('✓ база отвечает')
  console.log(' ', row?.version ?? 'версия не определилась')
}

main()
  .catch((error: unknown) => {
    console.error('✗ база не отвечает')
    console.error(' ', error instanceof Error ? error.message : error)
    console.error('')
    console.error('  Проверить: docker compose ps')
    console.error('  Поднять:   docker compose up -d')
    console.error('  И что DATABASE_URL в .env совпадает с docker-compose.yml')
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })

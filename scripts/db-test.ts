/**
 * Подготовить отдельную базу под тесты.
 *
 * Тесты начинают каждый случай с `TRUNCATE` всех таблиц
 * (`tests/helpers.ts`). Пока они ходили в ту же базу, что и дев-сервер,
 * любой `pnpm test` стирал рабочие данные вместе с оператором админки —
 * и человек обнаруживал это, когда не мог войти. Это не теория: именно
 * так и произошло.
 *
 * Поэтому у тестов своя база. Скрипт создаёт её, если нет, и
 * накатывает миграции. Запускается сам перед `vitest` — иначе про него
 * забудут ровно один раз, и этого хватит.
 */

import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { Client } from 'pg'

async function main(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    console.error('TEST_DATABASE_URL не задан: скопируйте строку из .env.example в .env')
    process.exitCode = 1
    return
  }
  if (url === process.env.DATABASE_URL) {
    console.error(
      'TEST_DATABASE_URL совпадает с DATABASE_URL. Тесты стирают базу целиком — ' +
        'рабочую базу им давать нельзя.',
    )
    process.exitCode = 1
    return
  }

  const parsed = new URL(url)
  const name = parsed.pathname.replace(/^\//, '')
  if (name === '') throw new Error('В TEST_DATABASE_URL нет имени базы')

  // Создавать базу можно только из другой базы, поэтому подключаемся
  // к служебной `postgres`.
  const admin = new URL(url)
  admin.pathname = '/postgres'
  admin.search = ''
  const client = new Client({ connectionString: admin.toString() })
  await client.connect()
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (existing.rowCount === 0) {
      // Имя подставляется в текст запроса: параметры в CREATE DATABASE
      // не работают. Поэтому оно проверяется по белому списку символов,
      // а не экранируется.
      if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`Непригодное имя базы: ${name}`)
      await client.query(`CREATE DATABASE "${name}"`)
      console.log(`[db:test] база ${name} создана`)
    }
  } finally {
    await client.end()
  }

  // Команда одной строкой, а не аргументами списком: со `shell: true`
  // аргументы не экранируются, и Node об этом предупреждает.
  const result = spawnSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: url },
  })
  if (result.status !== 0) {
    console.error('[db:test] миграции не накатились')
    process.exitCode = result.status ?? 1
  }
}

main().catch((error: unknown) => {
  console.error('[db:test] не удалось:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

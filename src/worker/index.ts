/**
 * Фоновый процесс.
 *
 * Второй запускаемый процесс рядом с `web` (docs/architecture.md).
 * Сейчас в нём живёт догон событий; дальше добавятся outbox отложенных
 * вызовов, поступления на крипто-адреса и сверки.
 *
 * Разделение нужно, потому что веб-процесс могут перезапустить или
 * размножить, а **догон обязан идти ровно в одном экземпляре**: два
 * параллельных читателя одного курсора будут обгонять друг друга и
 * пропускать страницы.
 *
 * Догон крутится непрерывно, а не «иногда». Доставка вебхуков
 * у эмитента одноразовая и без повторов: если наш эндпоинт лежал
 * минуту, события этой минуты восстановит только он.
 */

// Next читает .env сам, а tsx — нет: без этой строки процесс
// стартует без DATABASE_URL.
import 'dotenv/config'

import { prisma } from '../server/db/client'
import { catchUp, catchupStatus } from '../server/events'
import { createOxenClient } from '../server/oxen'
import { refreshPools } from '../server/services/pool'

/** Пауза между проходами, когда догонять нечего. */
const IDLE_MS = 5_000
/** Пауза после сбоя. Длиннее, чтобы не долбить упавший сервис. */
const BACKOFF_MS = 30_000

/**
 * Как часто перечитывать пулы компаний.
 *
 * Пул в нашей базе — зеркало, и инвариант платёжеспособности считается
 * по нему. Протухшее число опаснее отсутствующего: оно выглядит
 * правдоподобно. Чаще читать нельзя — чтение залога рейт-лимитится
 * целиком, на всех партнёров сразу.
 */
const POOLS_EVERY_MS = 5 * 60 * 1000

let stopping = false

async function main(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`
  console.log('[worker] запущен, база отвечает')

  const deps = { prisma, oxen: createOxenClient() }
  let poolsReadAt = 0

  for (; !stopping; ) {
    let pause = IDLE_MS
    try {
      if (Date.now() - poolsReadAt > POOLS_EVERY_MS) {
        poolsReadAt = Date.now()
        const pools = await refreshPools(prisma, deps.oxen)
        for (const failure of pools.failed) {
          // Сбой по одной компании не отменяет остальные и не роняет
          // догон: это разные дела, и останавливать из-за пула чтение
          // событий значило бы терять траты.
          console.error('[worker] пул не прочитан', failure)
        }
      }

      const result = await catchUp(deps)
      if (result.stored > 0 || result.applied > 0 || result.failed > 0) {
        console.log('[worker] догон', {
          страниц: result.pages,
          новых: result.stored,
          применено: result.applied,
          неудач: result.failed,
        })
      }
      // Не дочитали до пустой страницы — отставание есть, и спать
      // долго нельзя.
      if (!result.caughtUp) pause = 0
    } catch (error) {
      const status = await catchupStatus(prisma)
      console.error('[worker] догон не прошёл', {
        причина: error instanceof Error ? error.message : String(error),
        отставание: status.lagSeconds,
        вОчереди: status.unprocessed,
      })
      pause = BACKOFF_MS
    }

    if (pause > 0) await sleep(pause)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Останавливаемся между проходами, а не посреди обработки события. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log('[worker] остановка после текущего прохода')
    stopping = true
  })
}

main().catch((error: unknown) => {
  console.error('[worker] не стартовал:', error instanceof Error ? error.message : String(error))
  // Ненулевой код выхода обязателен: иначе супервизор сочтёт, что
  // процесс отработал штатно, и не перезапустит его.
  process.exitCode = 1
})

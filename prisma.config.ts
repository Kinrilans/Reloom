import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

/**
 * Конфигурация Prisma CLI.
 *
 * С 7-й версии строка подключения живёт здесь, а не в schema.prisma:
 * в схеме остаётся только провайдер. Схема — это модель данных, одна
 * на все окружения; адрес базы у каждого свой, и смешивать их в одном
 * файле было источником путаницы.
 *
 * `.env` подхватывается явным импортом: сам по себе CLI его больше не
 * читает, и без этой строки миграции молча пойдут мимо базы.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})

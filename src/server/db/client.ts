/**
 * Единственный экземпляр Prisma Client на процесс.
 *
 * Почему не `new PrismaClient()` по месту: в режиме разработки Next
 * перезагружает модули на каждое изменение файла, и каждый раз
 * создавался бы новый клиент со своим пулом соединений. Через десяток
 * правок Postgres упирается в лимит подключений и начинает отказывать —
 * причём выглядит это как случайные ошибки запросов, а не как утечка.
 *
 * Поэтому в разработке клиент живёт на `globalThis` и переживает
 * перезагрузку модулей. В проде перезагрузок нет, и прятать его туда
 * незачем.
 *
 * С 7-й версии Prisma ходит в базу через адаптер драйвера, а не через
 * собственный движок: строка подключения передаётся сюда, а не стоит
 * в schema.prisma.
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

/**
 * Обязательная переменная окружения.
 *
 * Падаем сразу и с внятным текстом. Молча подставленный `undefined`
 * превращается в попытку соединиться неизвестно с чем, и разбираться
 * приходится уже по странному поведению запросов.
 */
function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') {
    throw new Error(
      `Переменная окружения ${name} не задана. Скопируйте .env.example в .env и заполните его.`,
    )
  }
  return value
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: required('DATABASE_URL') })
  return new PrismaClient({ adapter })
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

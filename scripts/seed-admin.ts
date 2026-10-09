/**
 * Первый оператор админки.
 *
 * Войти в админку с нуля иначе нельзя: публичной регистрации нет, а
 * операторов заводит другой оператор. Этот скрипт создаёт того самого
 * первого — главного администратора, у которого есть все права,
 * включая `GRANT_RIGHTS`.
 *
 * Запуск:
 *
 *     pnpm db:seed-admin admin@example.com
 *
 * Пароль придумывает скрипт и печатает один раз: в базе лежит только
 * его хэш. Второй фактор администратор настраивает сам при первом
 * входе — экран входа выдаст секрет для приложения-аутентификатора.
 *
 * Повторный запуск с той же почтой **не создаёт второго оператора**:
 * он выдаёт новый одноразовый пароль. Так скрипт заодно работает
 * как «я забыл пароль, а второго оператора ещё нет».
 */

import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { prisma } from '../src/server/db/client'
import { hashPassword } from '../src/server/auth/password'
import { revokeAllSessions } from '../src/server/auth/session'
import { RIGHTS } from '../src/server/services/rights'
import { readSettings } from '../src/server/services/settings'

async function main(): Promise<void> {
  const email = (process.argv[2] ?? '').trim().toLowerCase()
  if (!email.includes('@')) {
    console.error('Укажите почту: pnpm db:seed-admin admin@example.com')
    process.exitCode = 1
    return
  }

  // Настройки — одна строка на систему. Заводим её здесь же: без неё
  // первое же зачисление упрётся в «настройки не заведены».
  await readSettings(prisma)

  const password = randomBytes(18).toString('base64url')
  const passwordHash = await hashPassword(password)

  const existing = await prisma.operator.findUnique({ where: { email } })
  if (existing) {
    await prisma.operator.update({
      where: { email },
      data: { passwordHash, isActive: true },
    })
    // Старые сессии отзываются: новый пароль не должен оставлять
    // в живых вход по прежнему.
    await revokeAllSessions(prisma, existing.id)
    report('Пароль обновлён', email, password)
    return
  }

  await prisma.operator.create({
    data: {
      email,
      fullName: 'Главный администратор',
      passwordHash,
      isSuperAdmin: true,
      rights: [...RIGHTS],
      locale: 'ru',
    },
  })
  report('Оператор создан', email, password)
}

function report(what: string, email: string, password: string): void {
  console.log('')
  console.log(`${what}: ${email}`)
  console.log(`Пароль (показывается один раз): ${password}`)
  console.log('')
  console.log('Дальше: откройте /admin/login, введите почту и пароль —')
  console.log('экран выдаст секрет для приложения-аутентификатора.')
  console.log('')
}

main()
  .catch((error: unknown) => {
    console.error('Не удалось:', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })

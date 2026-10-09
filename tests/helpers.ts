/**
 * Обвязка для тестов домена.
 *
 * Каждый тест начинается с чистой базы и явного набора данных: ничего
 * не наследуется от соседнего теста. Общее состояние между тестами —
 * это плавающие падения, разбирать которые дороже, чем лишний раз
 * пересоздать три строки.
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import type { Minor } from '@/shared/money'
import type { CardIssuePort, CardLimitPort, CardStatePort } from '@/server/domain/ports'
import { hashPassword } from '@/server/auth/password'
import { generateTotpSecret } from '@/server/auth/totp'

/**
 * Тесты ходят **только** в свою базу.
 *
 * Каждый случай начинается с `TRUNCATE` всех таблиц. Пока здесь стоял
 * `DATABASE_URL`, любой `pnpm test` стирал рабочие данные вместе
 * с оператором админки, и обнаруживалось это при попытке войти.
 *
 * Отката на рабочую базу нет нарочно: «если не задано, возьмём
 * DATABASE_URL» — это та же ошибка, только отложенная до первого
 * чистого окружения. Базу создаёт `pnpm db:test-prepare`, он же
 * запускается перед `vitest`.
 */
const connectionString = process.env.TEST_DATABASE_URL
if (!connectionString) {
  throw new Error(
    'TEST_DATABASE_URL не задан: скопируйте строку из .env.example в .env. ' +
      'Рабочую базу тестам давать нельзя — они очищают её целиком.',
  )
}
if (connectionString === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL совпадает с DATABASE_URL: тесты стёрли бы рабочую базу')
}

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

/**
 * Полная очистка. `TRUNCATE ... CASCADE` одним запросом, а не
 * `deleteMany` по таблицам: порядок удаления при внешних ключах
 * пришлось бы поддерживать руками, и он ломался бы при каждой новой
 * связи.
 */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      ledger_entries, ledger_transactions,
      card_transactions, card_transfers,
      deposit_requests, deposit_addresses, networks,
      cards, users, companies, operator_sessions, operators,
      settings, audit_log, oxen_events, outbound_intents, event_cursors,
      exchange_log
    RESTART IDENTITY CASCADE
  `)
}

/* --------------------------------------------------------------------------
   Заглушки портов
   -------------------------------------------------------------------------- */

export interface FakeLimitPort extends CardLimitPort {
  calls: { oxenCardId: string; limit: Minor }[]
  /** Следующий вызов упадёт. Нужен, чтобы проверить поведение при сбое
   *  второго вызова в переводе. */
  failNext: boolean
  failAlways: boolean
}

export function fakeLimitPort(): FakeLimitPort {
  const port: FakeLimitPort = {
    calls: [],
    failNext: false,
    failAlways: false,
    async setLimit(oxenCardId: string, limit: Minor) {
      if (port.failAlways || port.failNext) {
        port.failNext = false
        throw new Error('эмитент недоступен')
      }
      port.calls.push({ oxenCardId, limit })
    },
  }
  return port
}

export function fakeStatePort(): CardStatePort & { canceled: string[] } {
  const canceled: string[] = []
  return {
    canceled,
    async freeze() {},
    async unfreeze() {},
    async cancel(oxenCardId: string) {
      canceled.push(oxenCardId)
    },
  }
}

export function fakeIssuePort(options: { fail?: boolean } = {}): CardIssuePort & { issued: number } {
  const port = {
    issued: 0,
    async issueCard() {
      if (options.fail) throw new Error('выпуск карты не удался')
      port.issued += 1
      return { oxenCardId: `card_new_${port.issued}`, last4: '9999' }
    },
  }
  return port
}

/* --------------------------------------------------------------------------
   Данные
   -------------------------------------------------------------------------- */

export interface SeedOptions {
  poolMinor?: Minor
  depositFeeBps?: number
  depositFeeFixedMinor?: Minor
  withdrawalFeeBps?: number
  withdrawalFeeFixedMinor?: Minor
  minWithdrawalMinor?: Minor
  autoCreditOn?: boolean
  creditWithoutAml?: boolean
  amlMaxRisk?: number
  maxActiveCards?: number
  minDepositOn?: boolean
  minDepositMinor?: Minor | null
  userDepositFeeBps?: number | null
  userWithdrawalFeeBps?: number | null
}

export interface Seeded {
  companyId: string
  userId: string
  networkId: string
  addressId: string
}

export async function seed(options: SeedOptions = {}): Promise<Seeded> {
  await prisma.settings.create({
    data: {
      id: 'singleton',
      depositFeeBps: options.depositFeeBps ?? 0,
      depositFeeFixedMinor: options.depositFeeFixedMinor ?? 0n,
      withdrawalFeeBps: options.withdrawalFeeBps ?? 0,
      withdrawalFeeFixedMinor: options.withdrawalFeeFixedMinor ?? 0n,
      minWithdrawalMinor: options.minWithdrawalMinor ?? 0n,
      autoCreditOn: options.autoCreditOn ?? true,
      creditWithoutAml: options.creditWithoutAml ?? false,
      amlMaxRisk: options.amlMaxRisk ?? 70,
      maxActiveCards: options.maxActiveCards ?? 2,
    },
  })

  const company = await prisma.company.create({
    data: {
      name: 'Holding Alpha',
      oxenClientId: `cl_${Math.random().toString(36).slice(2, 10)}`,
      // Пул намеренно большой: инвариант компании проверяется отдельным
      // тестом, а в остальных он не должен мешаться под ногами.
      poolAvailableMinor: options.poolMinor ?? 100_000_000n,
    },
  })

  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      fullName: 'Соколов Дмитрий',
      oxenCardholderId: `chd_${Math.random().toString(36).slice(2, 10)}`,
      status: 'ACTIVE',
      depositFeeBps: options.userDepositFeeBps ?? null,
      withdrawalFeeBps: options.userWithdrawalFeeBps ?? null,
    },
  })

  const network = await prisma.network.create({
    data: {
      name: 'Tron (TRC-20)',
      asset: 'USDT',
      minDepositOn: options.minDepositOn ?? false,
      minDepositMinor: options.minDepositMinor ?? null,
    },
  })

  const address = await prisma.depositAddress.create({
    data: {
      userId: user.id,
      networkId: network.id,
      address: `T${Math.random().toString(36).slice(2, 12)}`,
    },
  })

  return {
    companyId: company.id,
    userId: user.id,
    networkId: network.id,
    addressId: address.id,
  }
}

export async function addCard(input: {
  userId: string
  isPrimary?: boolean
  status?: string
  appliedLimit?: Minor
  settledMinor?: Minor
  pendingMinor?: Minor
}): Promise<string> {
  const card = await prisma.card.create({
    data: {
      userId: input.userId,
      oxenCardId: `card_${Math.random().toString(36).slice(2, 12)}`,
      isPrimary: input.isPrimary ?? false,
      status: input.status ?? 'ACTIVE',
      appliedLimit: input.appliedLimit ?? 0n,
      settledMinor: input.settledMinor ?? 0n,
      pendingMinor: input.pendingMinor ?? 0n,
      last4: Math.floor(1000 + Math.random() * 8999).toString(),
    },
  })
  return card.id
}

/**
 * Пароль тестового оператора.
 *
 * Хэш настоящий, а не строка-заглушка: тесты смены пароля проверяют,
 * что прежний перестал подходить, и на заглушке это не проверить.
 */
export const OPERATOR_PASSWORD = 'пароль-тестового-оператора'

export async function addOperator(rights: string[], isSuperAdmin = false) {
  return prisma.operator.create({
    data: {
      email: `op_${Math.random().toString(36).slice(2, 10)}@reloom.local`,
      fullName: 'Оператор',
      passwordHash: await hashPassword(OPERATOR_PASSWORD),
      // Второй фактор сразу подтверждён: иначе каждый тест прав
      // начинался бы с его настройки.
      totpSecret: generateTotpSecret(),
      totpConfirmedAt: new Date(),
      rights,
      isSuperAdmin,
    },
  })
}

/** Остаток по карте, прочитанный из базы. */
export async function remainingOfCard(cardId: string): Promise<Minor> {
  const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } })
  return card.appliedLimit - card.settledMinor - card.pendingMinor
}

export async function balanceOf(userId: string): Promise<Minor> {
  const result = await prisma.ledgerEntry.aggregate({
    where: { account: `USER:${userId}` },
    _sum: { amountMinor: true },
  })
  return result._sum.amountMinor ?? 0n
}

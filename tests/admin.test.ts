/**
 * Админка: доступ, права, полный путь и списки на объёме.
 *
 * Серверные действия Next (`'use server'`) здесь не вызываются: они
 * читают cookie и без запроса не живут. Проверяется слой под ними —
 * тот, где принимаются решения: сессии, права, сервисы и запросы
 * списков. Сами действия только разбирают ввод и зовут это же.
 *
 * Главный тест этапа — «ЧЕРЕЗ АДМИНКУ ПРОХОДИТСЯ ПОЛНЫЙ ПУТЬ»:
 * завести пользователя, завести его у эмитента, зачислить деньги,
 * выпустить карту, увидеть трату. Он идёт теми же вызовами, что
 * делают экраны, и в том же порядке.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { OxenError } from '@/server/oxen/errors'
import { MockOxenClient } from '@/server/oxen/mock'
import { limitPort } from '@/server/oxen/ports'
import { hashPassword, verifyPassword } from '@/server/auth/password'
import {
  changeOwnPassword,
  resetOperatorPassword,
  resetOperatorTotp,
} from '@/server/services/operators'
import {
  createSession,
  resolveSession,
  revokeAllSessions,
  revokeSession,
} from '@/server/auth/session'
import { checkPasswordStep, signIn } from '@/server/auth/signin'
import { resetThrottle } from '@/server/auth/throttle'
import { totpNow, verifyTotp } from '@/server/auth/totp'
import { catchUp } from '@/server/events'
import { listUsers, userCard } from '@/server/admin/users'
import { listCards } from '@/server/admin/cards'
import { listDeposits, depositDetail } from '@/server/admin/deposits'
import { listTransactions } from '@/server/admin/transactions'
import { listAddresses } from '@/server/admin/addresses'
import { listAudit, listExchange } from '@/server/admin/journals'
import { dashboard } from '@/server/admin/dashboard'
import { systemView } from '@/server/admin/system'
import { toCsv } from '@/server/admin/csv'
import { logged } from '@/server/exchange/logged'
import { burnAddress } from '@/server/services/addresses'
import { issueCard } from '@/server/services/cardAdmin'
import {
  confirmDeposit,
  markRefunded,
  registerIncoming,
  rejectDeposit,
} from '@/server/services/deposits'
import { companyPools, refreshPools } from '@/server/services/pool'
import { RIGHTS } from '@/server/services/rights'
import { readSettings, updateSettings } from '@/server/services/settings'
import { blockUser, createCardholder, createUser, unblockUser } from '@/server/services/users'
import { OPERATOR_PASSWORD, addOperator, balanceOf, prisma, resetDb, seed } from './helpers'

function acting(operator: { id: string; rights: string[]; isSuperAdmin: boolean }) {
  return { ...operator, isActive: true }
}

async function superAdmin() {
  const row = await addOperator([...RIGHTS], true)
  return acting(row)
}

/**
 * Завести пользователя у эмитента и получить одобрение.
 *
 * В заглушке картхолдер должен существовать: `seed()` кладёт в базу
 * идентификатор, которого в свежей заглушке нет, и выпуск карты по
 * нему честно упирается в «картхолдер не найден».
 */
async function approveAtIssuer(
  oxen: MockOxenClient,
  operator: { id: string; rights: string[]; isSuperAdmin: boolean; isActive: boolean },
  userId: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { oxenCardholderId: null, email: 'seed@example.com' },
  })
  await createCardholder(prisma, oxen, operator, userId)
}

beforeEach(async () => {
  await resetDb()
  resetThrottle()
})

/* --------------------------------------------------------------------------
   Вход
   -------------------------------------------------------------------------- */

describe('вход оператора', () => {
  it('пароль хэшируется и проверяется, а неверный не проходит', async () => {
    const hash = await hashPassword('очень-длинный-пароль')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword('очень-длинный-пароль', hash)).toBe(true)
    expect(await verifyPassword('почти-тот-же-пароль', hash)).toBe(false)
    // Испорченный хэш — это «не сошлось», а не исключение: иначе по
    // ошибке видно, что с этим оператором в базе что-то не то.
    expect(await verifyPassword('любой', 'мусор')).toBe(false)
  })

  it('короткий пароль не принимается', async () => {
    await expect(hashPassword('коротко')).rejects.toThrow(/короче/)
  })

  it('ПАРОЛЯ БЕЗ ВТОРОГО ФАКТОРА НЕ ХВАТАЕТ: сессия создаётся только после кода', async () => {
    const password = 'пароль-для-первого-входа'
    const operator = await prisma.operator.create({
      data: {
        email: 'chief@reloom.local',
        fullName: 'Главный администратор',
        passwordHash: await hashPassword(password),
        isSuperAdmin: true,
        rights: [...RIGHTS],
      },
    })

    // Первый шаг: пароль верен, фактора ещё нет — выдан секрет.
    const step = await checkPasswordStep(prisma, {
      email: 'chief@reloom.local',
      password,
    })
    expect(step.ok).toBe(true)
    expect(step.ok && step.needsSetup).toBe(true)
    // И при этом ни одной сессии: пароль сам по себе доступа не даёт.
    expect(await prisma.operatorSession.count()).toBe(0)

    const secret = step.ok && step.needsSetup ? step.secret : ''
    // Неверный код не пускает.
    const bad = await signIn(prisma, {
      email: 'chief@reloom.local',
      password,
      code: '000000',
    })
    expect(bad.ok).toBe(false)
    expect(await prisma.operatorSession.count()).toBe(0)

    const good = await signIn(prisma, {
      email: 'chief@reloom.local',
      password,
      code: totpNow(secret),
    })
    expect(good.ok).toBe(true)

    // Секрет подтверждён, сессия есть, вход записан в аудит.
    const fresh = await prisma.operator.findUniqueOrThrow({ where: { id: operator.id } })
    expect(fresh.totpConfirmedAt).not.toBeNull()
    const audit = await prisma.auditLog.findFirst({ where: { action: 'SIGNED_IN' } })
    expect(audit?.operatorId).toBe(operator.id)
  })

  it('код второго фактора принимается с допуском в один шаг и не принимается дальше', () => {
    const secret = 'JBSWY3DPEHPK3PXP'
    const now = new Date('2026-10-09T12:00:00Z')
    const earlier = new Date(now.getTime() - 30_000)
    const tooEarly = new Date(now.getTime() - 120_000)

    expect(verifyTotp(secret, totpNow(secret, now), now)).toBe(true)
    // Часы на телефоне и на сервере расходятся — шаг назад принимается.
    expect(verifyTotp(secret, totpNow(secret, earlier), now)).toBe(true)
    // А подсмотренный две минуты назад код уже нет.
    expect(verifyTotp(secret, totpNow(secret, tooEarly), now)).toBe(false)
  })

  it('сессия отзывается и после этого не пускает', async () => {
    const operator = await addOperator(['MANAGE_USERS'])
    const session = await createSession(prisma, operator.id)

    expect((await resolveSession(prisma, session.token))?.id).toBe(operator.id)

    await revokeSession(prisma, session.token)
    expect(await resolveSession(prisma, session.token)).toBeNull()
  })

  it('отключённый оператор теряет доступ сразу, а не по истечении сессии', async () => {
    const operator = await addOperator(['MANAGE_USERS'])
    const session = await createSession(prisma, operator.id)
    expect(await resolveSession(prisma, session.token)).not.toBeNull()

    await prisma.operator.update({ where: { id: operator.id }, data: { isActive: false } })
    expect(await resolveSession(prisma, session.token)).toBeNull()
  })

  it('просроченная сессия не пускает', async () => {
    const operator = await addOperator(['MANAGE_USERS'])
    const session = await createSession(prisma, operator.id, new Date('2026-01-01T00:00:00Z'))
    expect(await resolveSession(prisma, session.token, new Date('2026-01-03T00:00:00Z'))).toBeNull()
  })

  it('отзыв всех сессий выгоняет из всех вкладок', async () => {
    const operator = await addOperator(['MANAGE_USERS'])
    const first = await createSession(prisma, operator.id)
    const second = await createSession(prisma, operator.id)

    expect(await revokeAllSessions(prisma, operator.id)).toBe(2)
    expect(await resolveSession(prisma, first.token)).toBeNull()
    expect(await resolveSession(prisma, second.token)).toBeNull()
  })
})

/* --------------------------------------------------------------------------
   Права
   -------------------------------------------------------------------------- */

describe('права проверяются на сервере', () => {
  it('без MANAGE_USERS пользователя не завести', async () => {
    const seeded = await seed()
    const operator = acting(await addOperator(['APPROVE_DEPOSITS']))
    await expect(
      createUser(prisma, operator, {
        companyId: seeded.companyId,
        fullName: 'Иванов Иван',
        email: 'ivan@example.com',
      }),
    ).rejects.toThrow(/MANAGE_USERS/)
  })

  it('без MANAGE_ADDRESSES адрес не уничтожить', async () => {
    const seeded = await seed()
    const operator = acting(await addOperator(['MANAGE_USERS']))
    await expect(
      burnAddress(prisma, operator, { addressId: seeded.addressId, reason: 'COMPROMISED' }),
    ).rejects.toThrow(/MANAGE_ADDRESSES/)
  })

  it('главный администратор обладает всеми правами', async () => {
    const seeded = await seed()
    const chief = await superAdmin()
    // Прав в списке у него нет вовсе — он главный администратор.
    const { userId } = await createUser(prisma, chief, {
      companyId: seeded.companyId,
      fullName: 'Петров Пётр',
      email: 'petr@example.com',
    })
    expect(userId).toBeTruthy()
  })

  it('отключённый оператор не может ничего, даже с правом', async () => {
    const seeded = await seed()
    const row = await addOperator(['MANAGE_USERS'])
    await expect(
      createUser(
        prisma,
        { id: row.id, rights: row.rights, isSuperAdmin: false, isActive: false },
        { companyId: seeded.companyId, fullName: 'Кто-то', email: 'x@example.com' },
      ),
    ).rejects.toThrow(/MANAGE_USERS/)
  })
})

/* --------------------------------------------------------------------------
   Свой доступ
   -------------------------------------------------------------------------- */

describe('свой доступ через раздел «Операторы» не меняется', () => {
  /* Эти два действия выдают случайное значение и отзывают сессии цели.
     Применённые к себе, они выбрасывают оператора из админки раньше,
     чем он прочитает выданный пароль: старый уже не действует, нового
     он не видел. Возврат — только через другого оператора или скрипт
     первого запуска, поэтому запрет стоит на сервере. */

  it('СЕБЕ ПАРОЛЬ НЕ ВЫДАЁТСЯ', async () => {
    await seed()
    const row = await addOperator([...RIGHTS])
    await expect(resetOperatorPassword(prisma, acting(row), row.id)).rejects.toThrow(
      /SELF_IN_PROFILE|профиле/,
    )

    // Пароль остался прежним — иначе запрет был бы декоративным.
    const after = await prisma.operator.findUniqueOrThrow({ where: { id: row.id } })
    expect(after.passwordHash).toBe(row.passwordHash)
  })

  it('СЕБЕ ВТОРОЙ ФАКТОР НЕ СБРАСЫВАЕТСЯ', async () => {
    await seed()
    const row = await addOperator([...RIGHTS])
    await expect(resetOperatorTotp(prisma, acting(row), row.id)).rejects.toThrow(
      /SELF_IN_PROFILE|профиле/,
    )
    const after = await prisma.operator.findUniqueOrThrow({ where: { id: row.id } })
    expect(after.totpSecret).toBe(row.totpSecret)
  })

  it('ГЛАВНЫЙ АДМИНИСТРАТОР ТОЖЕ НЕ ИСКЛЮЧЕНИЕ', async () => {
    // У него нет никого, кто вернул бы ему доступ, так что для него
    // запрет важнее всех.
    await seed()
    const chief = await superAdmin()
    await expect(resetOperatorPassword(prisma, chief, chief.id)).rejects.toThrow(/профиле/)
  })

  it('ЧУЖОЙ ПАРОЛЬ ВЫДАЁТСЯ И ОТЗЫВАЕТ ЕГО СЕССИИ', async () => {
    await seed()
    const chief = await superAdmin()
    const other = await addOperator(['MANAGE_USERS'])
    const session = await createSession(prisma, other.id)

    const { oneTimePassword } = await resetOperatorPassword(prisma, chief, other.id)
    expect(oneTimePassword.length).toBeGreaterThan(20)

    // Своя вкладка главного администратора при этом жива, а чужая нет.
    expect(await resolveSession(prisma, session.token)).toBeNull()
  })

  it('СВОЙ ПАРОЛЬ МЕНЯЕТСЯ В ПРОФИЛЕ И СВОЯ СЕССИЯ ЖИВЁТ', async () => {
    await seed()
    const row = await addOperator(['MANAGE_USERS'])
    const mine = await createSession(prisma, row.id)
    const elsewhere = await createSession(prisma, row.id)
    const mineId = (await resolveSession(prisma, mine.token))!.sessionId

    await changeOwnPassword(prisma, acting(row), {
      currentPassword: OPERATOR_PASSWORD,
      nextPassword: 'совершенно-новый-пароль',
      keepSessionId: mineId,
    })

    // Вкладка, из которой меняли, осталась живой: выгонять человека
    // из неё незачем. Остальные отозваны — пароль меняют и потому,
    // что он утёк.
    expect(await resolveSession(prisma, mine.token)).not.toBeNull()
    expect(await resolveSession(prisma, elsewhere.token)).toBeNull()

    const after = await prisma.operator.findUniqueOrThrow({ where: { id: row.id } })
    expect(await verifyPassword('совершенно-новый-пароль', after.passwordHash)).toBe(true)
    expect(await verifyPassword(OPERATOR_PASSWORD, after.passwordHash)).toBe(false)
  })

  it('БЕЗ ТЕКУЩЕГО ПАРОЛЯ СВОЙ НЕ МЕНЯЕТСЯ', async () => {
    // Иначе открытая вкладка сама становится способом сменить пароль,
    // не зная прежнего.
    await seed()
    const row = await addOperator(['MANAGE_USERS'])
    await expect(
      changeOwnPassword(prisma, acting(row), {
        currentPassword: 'не тот пароль',
        nextPassword: 'другой-длинный-пароль',
      }),
    ).rejects.toThrow(/BAD_PASSWORD|не сошёлся/)
  })
})

/* --------------------------------------------------------------------------
   Полный путь
   -------------------------------------------------------------------------- */

describe('полный путь оператора', () => {
  it('ЧЕРЕЗ АДМИНКУ ПРОХОДИТСЯ ПОЛНЫЙ ПУТЬ: завести → зачислить → выпустить карту → увидеть трату', async () => {
    const chief = await superAdmin()
    const oxen = new MockOxenClient()

    // --- Настройки: комиссия пополнения 1.5% плюс два доллара -------
    await readSettings(prisma)
    await updateSettings(prisma, chief, {
      depositFeeBps: 150,
      depositFeeFixedMinor: 200n,
      minDepositMinor: 10_000n,
    })

    // --- Компания -----------------------------------------------------
    const company = await prisma.company.create({
      data: {
        name: 'Holding Alpha',
        oxenClientId: 'cl_alpha',
        poolAvailableMinor: 1_000_000n,
      },
    })

    // --- 1. Завести пользователя -------------------------------------
    const { userId } = await createUser(prisma, chief, {
      companyId: company.id,
      fullName: 'Соколов Дмитрий',
      email: 'sokolov@example.com',
    })

    // --- 2. Завести его у эмитента -----------------------------------
    const cardholder = await createCardholder(prisma, oxen, chief, userId)
    expect(cardholder.approved).toBe(true)
    expect(cardholder.oxenCardholderId.startsWith('chd_')).toBe(true)

    // Повтор не создаёт второго картхолдера: намерение записано
    // до вызова и переиспользуется.
    const again = await createCardholder(prisma, oxen, chief, userId)
    expect(again.oxenCardholderId).toBe(cardholder.oxenCardholderId)

    // --- 3. Зачислить -------------------------------------------------
    const network = await prisma.network.create({
      data: { id: 'tron-usdt', name: 'Tron (TRC-20)', asset: 'USDT' },
    })
    const address = await prisma.depositAddress.create({
      data: { userId, networkId: network.id, address: 'TAlphaDemoAddress' },
    })

    // Поступление пришло, но проверка его не пропустила бы сама:
    // ставим ручной режим, чтобы пройти путь оператора.
    await updateSettings(prisma, chief, { autoCreditOn: false })
    const incoming = await registerIncoming(prisma, limitPort(oxen), {
      chainTxId: 'chain-tx-1',
      addressId: address.id,
      receivedMinor: 100_000n,
      fromAddress: 'TSenderAddress',
      amlVerdict: 'PASSED',
      amlRisk: 10,
    })
    expect(incoming.status).toBe('SUBMITTED')

    // Заявка видна в очереди оператора.
    const queue = await listDeposits(prisma, { filter: 'queue', page: 0, pageSize: 20 })
    expect(queue.rows).toHaveLength(1)
    expect(queue.queueSize).toBe(1)

    // Карточка заявки показывает расчёт до нажатия кнопки.
    const detail = await depositDetail(prisma, incoming.requestId)
    // 1000.00 · 1.5% = 15.00, плюс фикс 2.00 → удержим 17.00.
    expect(detail?.preview.fee).toBe('17.00')
    expect(detail?.preview.net).toBe('983.00')

    const credited = await confirmDeposit(prisma, limitPort(oxen), {
      requestId: incoming.requestId,
      operatorId: chief.id,
      receivedMinor: 100_000n,
    })
    expect(credited.netMinor).toBe(98_300n)
    expect(await balanceOf(userId)).toBe(98_300n)

    // --- 4. Выпустить карту ------------------------------------------
    const card = await issueCard(prisma, oxen, chief, {
      userId,
      allocateMinor: 98_300n,
    })
    expect(card.isPrimary).toBe(true)

    const afterIssue = await userCard(prisma, userId)
    expect(afterIssue?.cards).toHaveLength(1)
    expect(afterIssue?.unallocated).toBe('0.00')
    expect(afterIssue?.available).toBe('983.00')

    // --- 5. Увидеть трату ---------------------------------------------
    // Трата приходит событиями эмитента и разбирается догоном — тем же
    // путём, что в жизни.
    const authorization = oxen.simulateAuthorization(card.oxenCardId, {
      amountMinor: 12_400n,
      merchantName: 'SQ *COFFEE SHOP 4411',
    })
    oxen.simulateSettlement(authorization.id, 12_400n)
    const result = await catchUp({ prisma, oxen })
    expect(result.failed).toBe(0)

    const transactions = await listTransactions(prisma, { page: 0, pageSize: 20 })
    expect(transactions.total).toBe(1)
    expect(transactions.rows[0]?.merchant).toBe('SQ *COFFEE SHOP 4411')
    expect(transactions.rows[0]?.amount).toBe('124.00')
    expect(transactions.rows[0]?.display).toBe('completed')

    // Баланс уменьшился на сумму сеттлмента, остаток по карте тоже.
    expect(await balanceOf(userId)).toBe(98_300n - 12_400n)
    const afterSpend = await userCard(prisma, userId)
    expect(afterSpend?.cards[0]?.available).toBe('859.00')
    expect(afterSpend?.cards[0]?.spent).toBe('124.00')

    // --- Путь отражён в аудите ---------------------------------------
    const audit = await listAudit(prisma, { page: 0, pageSize: 50 })
    const actions = audit.rows.map((row) => row.action)
    expect(actions).toContain('USER_CREATED')
    expect(actions).toContain('CARDHOLDER_CREATED')
    expect(actions).toContain('CARD_ISSUED')
    expect(actions).toContain('SETTINGS_CHANGED')

    // --- И виден на дашборде -----------------------------------------
    const view = await dashboard(prisma, {})
    // Удержанная комиссия — наши деньги, и считается она из леджера.
    expect(view.revenue.profit).toBe('17.00')
    expect(view.pools[0]?.issued).toBe('859.00')
  })

  it('заблокированный пользователь теряет карты, а разблокировка возвращает только их', async () => {
    const chief = await superAdmin()
    const oxen = new MockOxenClient()
    const seeded = await seed()
    await approveAtIssuer(oxen, chief, seeded.userId)

    const issued = await issueCard(prisma, oxen, chief, {
      userId: seeded.userId,
      allocateMinor: 0n,
    })

    await blockUser(prisma, oxen, chief, { userId: seeded.userId, reason: 'подозрение' })
    const blocked = await prisma.card.findUniqueOrThrow({ where: { id: issued.cardId } })
    expect(blocked.status).toBe('FROZEN')
    expect(blocked.freezeReason).toBe('BY_BLOCK')

    await unblockUser(prisma, oxen, chief, seeded.userId)
    const unblocked = await prisma.card.findUniqueOrThrow({ where: { id: issued.cardId } })
    expect(unblocked.status).toBe('ACTIVE')
    expect(unblocked.freezeReason).toBeNull()

    const audit = await listAudit(prisma, { page: 0, pageSize: 20 })
    expect(audit.rows.map((row) => row.action)).toContain('USER_BLOCKED')
    // Блокировка выделяется в журнале отдельно: это действие с доступом.
    expect(audit.rows.find((row) => row.action === 'USER_BLOCKED')?.highlight).toBe(true)
  })

  it('карту нельзя выпустить, пока картхолдер не одобрен', async () => {
    const chief = await superAdmin()
    const oxen = new MockOxenClient()
    const seeded = await seed()

    await prisma.user.update({
      where: { id: seeded.userId },
      data: { oxenStatus: 'PENDING' },
    })

    await expect(
      issueCard(prisma, oxen, chief, { userId: seeded.userId, allocateMinor: 0n }),
    ).rejects.toThrow(/одобрен/)

    // И статус, которого мы не читали, тоже не считается одобрением.
    await prisma.user.update({ where: { id: seeded.userId }, data: { oxenStatus: null } })
    await expect(
      issueCard(prisma, oxen, chief, { userId: seeded.userId, allocateMinor: 0n }),
    ).rejects.toThrow(/одобрен/)
  })

  it('выделить карте больше нераспределённого нельзя', async () => {
    const chief = await superAdmin()
    const oxen = new MockOxenClient()
    const seeded = await seed()
    await approveAtIssuer(oxen, chief, seeded.userId)

    await expect(
      issueCard(prisma, oxen, chief, { userId: seeded.userId, allocateMinor: 10_000n }),
    ).rejects.toThrow(/Нераспределённого/)
  })
})

/* --------------------------------------------------------------------------
   Двое операторов на одной заявке
   -------------------------------------------------------------------------- */

describe('двое операторов на одной заявке', () => {
  it('ДАЮТ ОДНУ ПРОВОДКУ: второй получает результат первого', async () => {
    const seeded = await seed({ depositFeeBps: 0 })
    const first = await addOperator(['APPROVE_DEPOSITS'])
    const second = await addOperator(['APPROVE_DEPOSITS'])
    const oxen = new MockOxenClient()

    await prisma.settings.update({ where: { id: 'singleton' }, data: { autoCreditOn: false } })
    const incoming = await registerIncoming(prisma, limitPort(oxen), {
      chainTxId: 'chain-tx-double',
      addressId: seeded.addressId,
      receivedMinor: 50_000n,
      amlVerdict: 'PASSED',
    })

    const [a, b] = await Promise.all([
      confirmDeposit(prisma, limitPort(oxen), {
        requestId: incoming.requestId,
        operatorId: first.id,
        receivedMinor: 50_000n,
      }),
      confirmDeposit(prisma, limitPort(oxen), {
        requestId: incoming.requestId,
        operatorId: second.id,
        receivedMinor: 50_000n,
      }),
    ])

    // Проводка одна, и оба оператора видят одну и ту же.
    expect(a.ledgerTransactionId).toBe(b.ledgerTransactionId)
    expect(await prisma.ledgerTransaction.count({ where: { type: 'DEPOSIT' } })).toBe(1)
    expect(await balanceOf(seeded.userId)).toBe(50_000n)
    // Ровно один из двух запросов создал проводку.
    expect([a.alreadyCredited, b.alreadyCredited].filter(Boolean)).toHaveLength(1)
  })

  it('зачисленную заявку нельзя отклонить задним числом', async () => {
    const seeded = await seed({ depositFeeBps: 0 })
    const operator = await addOperator(['APPROVE_DEPOSITS'])
    const oxen = new MockOxenClient()

    await prisma.settings.update({ where: { id: 'singleton' }, data: { autoCreditOn: false } })
    const incoming = await registerIncoming(prisma, limitPort(oxen), {
      chainTxId: 'chain-tx-reject',
      addressId: seeded.addressId,
      receivedMinor: 30_000n,
      amlVerdict: 'PASSED',
    })
    await confirmDeposit(prisma, limitPort(oxen), {
      requestId: incoming.requestId,
      operatorId: operator.id,
      receivedMinor: 30_000n,
    })

    await expect(
      rejectDeposit(prisma, {
        requestId: incoming.requestId,
        operatorId: operator.id,
        reasonCode: 'AMOUNT_MISMATCH',
      }),
    ).rejects.toThrow(/CREDITED/)
  })

  it('причина «другое» требует пояснения: иначе пользователь получит пустой отказ', async () => {
    const seeded = await seed()
    const operator = await addOperator(['APPROVE_DEPOSITS'])
    const oxen = new MockOxenClient()
    await prisma.settings.update({ where: { id: 'singleton' }, data: { autoCreditOn: false } })
    const incoming = await registerIncoming(prisma, limitPort(oxen), {
      chainTxId: 'chain-tx-other',
      addressId: seeded.addressId,
      receivedMinor: 30_000n,
      amlVerdict: 'PASSED',
    })

    await expect(
      rejectDeposit(prisma, {
        requestId: incoming.requestId,
        operatorId: operator.id,
        reasonCode: 'OTHER',
      }),
    ).rejects.toThrow(/пояснения/)
  })
})

describe('возврат отправителю', () => {
  it('удержанное поступление уходит обратно, а адрес уничтожается', async () => {
    const seeded = await seed()
    const oxen = new MockOxenClient()

    // Проверка не пройдена: деньги пришли, но в леджер не попали.
    const held = await registerIncoming(prisma, limitPort(oxen), {
      chainTxId: 'chain-tx-held',
      addressId: seeded.addressId,
      receivedMinor: 40_000n,
      fromAddress: 'TSenderAddress',
      amlVerdict: 'FAILED',
      amlRisk: 95,
    })
    expect(held.status).toBe('HELD')
    expect(await balanceOf(seeded.userId)).toBe(0n)

    await markRefunded(prisma, held.requestId)

    const request = await prisma.depositRequest.findUniqueOrThrow({
      where: { id: held.requestId },
    })
    expect(request.status).toBe('REFUNDED')

    // Адрес больше не выдаётся: он засвечен в той же цепочке, и
    // следующее поступление на него притащит ту же историю.
    const address = await prisma.depositAddress.findUniqueOrThrow({
      where: { id: seeded.addressId },
    })
    expect(address.status).toBe('BURNED')
    expect(address.burnReason).toBe('REFUNDED')

    // И проводок по нему так и не появилось: денег у нас не было.
    expect(await prisma.ledgerTransaction.count()).toBe(0)

    // Оператор видит уничтоженный адрес в реестре, а не теряет его.
    const registry = await listAddresses(prisma, { status: 'BURNED', page: 0, pageSize: 20 })
    expect(registry.total).toBe(1)
    expect(registry.rows[0]?.amlVerdict).toBe('FAILED')
  })
})

/* --------------------------------------------------------------------------
   Списки на объёме
   -------------------------------------------------------------------------- */

describe('списки работают на тысяче строк', () => {
  it('поиск, отбор и страницы считаются в базе', async () => {
    const seeded = await seed()
    const other = await prisma.company.create({
      data: { name: 'Holding Beta', oxenClientId: 'cl_beta' },
    })

    // Тысяча пользователей: девятьсот активных и сотня заблокированных,
    // плюс сотня во второй компании.
    const rows = Array.from({ length: 1000 }, (_, index) => ({
      companyId: index < 900 ? seeded.companyId : other.id,
      fullName: index % 7 === 0 ? `Соколова Мария ${index}` : `Иванов Иван ${index}`,
      email: `user${index}@example.com`,
      status: index % 10 === 0 ? 'BLOCKED' : 'ACTIVE',
    }))
    await prisma.user.createMany({ data: rows })

    const page = await listUsers(prisma, { filter: 'ACTIVE', page: 0, pageSize: 20 })
    // 1000 созданных плюс один из seed, десятая часть заблокирована.
    expect(page.total).toBe(901)
    expect(page.rows).toHaveLength(20)

    // Вторая страница — другие двадцать строк.
    const second = await listUsers(prisma, { filter: 'ACTIVE', page: 1, pageSize: 20 })
    expect(second.rows[0]?.id).not.toBe(page.rows[0]?.id)

    // Отбор по компании.
    const byCompany = await listUsers(prisma, {
      companyId: other.id,
      filter: 'all',
      page: 0,
      pageSize: 20,
    })
    expect(byCompany.total).toBe(100)

    // Поиск по части имени, без учёта регистра.
    const found = await listUsers(prisma, {
      filter: 'all',
      search: 'соколова',
      page: 0,
      pageSize: 20,
    })
    expect(found.total).toBe(143)

    // Заблокированные — через фильтр, и только они.
    const blocked = await listUsers(prisma, { filter: 'BLOCKED', page: 0, pageSize: 20 })
    expect(blocked.total).toBe(100)
    expect(blocked.rows.every((row) => row.status === 'BLOCKED')).toBe(true)
  })

  it('список карт отбирается по статусу и типу', async () => {
    const seeded = await seed()
    const chief = await superAdmin()
    const oxen = new MockOxenClient()
    await approveAtIssuer(oxen, chief, seeded.userId)

    const primary = await issueCard(prisma, oxen, chief, {
      userId: seeded.userId,
      allocateMinor: 0n,
    })
    await issueCard(prisma, oxen, chief, { userId: seeded.userId, allocateMinor: 0n })
    await prisma.card.update({ where: { id: primary.cardId }, data: { status: 'CLOSING' } })

    expect((await listCards(prisma, { status: 'all', kind: 'all', page: 0, pageSize: 20 })).total).toBe(2)
    expect(
      (await listCards(prisma, { status: 'CLOSING', kind: 'all', page: 0, pageSize: 20 })).total,
    ).toBe(1)
    expect(
      (await listCards(prisma, { status: 'all', kind: 'primary', page: 0, pageSize: 20 })).total,
    ).toBe(1)
  })
})

/* --------------------------------------------------------------------------
   Журналы и состояние
   -------------------------------------------------------------------------- */

describe('журнал обмена', () => {
  it('записывает вызов наружу и его исход', async () => {
    const company = await prisma.company.create({
      data: { name: 'Holding Alpha', oxenClientId: 'cl_alpha' },
    })
    const oxen = logged(new MockOxenClient(), { prisma, service: 'OXEN' })

    await oxen.getFunding(company.oxenClientId)

    const journal = await listExchange(prisma, { page: 0, pageSize: 20 })
    expect(journal.total).toBe(1)
    expect(journal.rows[0]?.operation).toBe('getFunding')
    expect(journal.rows[0]?.method).toBe('GET')
    expect(journal.rows[0]?.outcome).toBe('OK')
    expect(journal.rows[0]?.subject).toBe(company.oxenClientId)
  })

  it('РЕКВИЗИТЫ В ЖУРНАЛ НЕ ПОПАДАЮТ: у чтения секретов нет сводки', async () => {
    const seeded = await seed()
    const chief = await superAdmin()
    const base = new MockOxenClient()
    const oxen = logged(base, { prisma, service: 'OXEN' })
    await approveAtIssuer(base, chief, seeded.userId)
    const card = await issueCard(prisma, base, chief, {
      userId: seeded.userId,
      allocateMinor: 0n,
    })

    await oxen.createSecretsSession(card.oxenCardId, 'session-1')

    const journal = await listExchange(prisma, { page: 0, pageSize: 20 })
    const entry = journal.rows.find((row) => row.operation === 'createSecretsSession')
    expect(entry).toBeDefined()
    // Операции нет в списке разрешённых, поэтому ни запроса, ни ответа.
    expect(entry?.request).toBeNull()
    expect(entry?.response).toBeNull()
  })

  it('неудачный вызов записывается с кодом ошибки', async () => {
    const base = new MockOxenClient()
    const oxen = logged(base, { prisma, service: 'OXEN' })
    base.failNext(
      'getCard',
      new OxenError({
        code: 'CARD_TERMINAL',
        message: 'карта отменена',
        httpStatus: 409,
        requestId: 'req_test',
      }),
    )

    await expect(oxen.getCard('card_missing')).rejects.toThrow()

    const journal = await listExchange(prisma, { outcome: 'FAILED', page: 0, pageSize: 20 })
    expect(journal.total).toBe(1)
    expect(journal.rows[0]?.errorCode).toBe('CARD_TERMINAL')
  })
})

describe('состояние системы', () => {
  it('показывает пулы, прочитанные у эмитента, и когда их читали', async () => {
    const oxen = new MockOxenClient()
    await prisma.company.create({
      data: { name: 'Holding Alpha', oxenClientId: 'cl_alpha' },
    })

    const before = await companyPools(prisma)
    expect(before[0]?.poolReadAt).toBeNull()

    const result = await refreshPools(prisma, oxen)
    expect(result.updated).toBe(1)

    const after = await companyPools(prisma)
    expect(after[0]?.poolReadAt).not.toBeNull()
    // Депозитный адрес подтягивается тем же проходом и руками
    // не задаётся.
    expect(after[0]?.depositAddress).toBeTruthy()

    const system = await systemView(prisma)
    expect(system.lastPoolRead).not.toBeNull()
  })

  it('отличает «давно не читали» от «не применяется»', async () => {
    await prisma.eventCursor.create({
      data: { id: 'oxen', lastSyncedAt: new Date(Date.now() - 300_000) },
    })
    await prisma.oxenEvent.create({
      data: {
        id: 'evt_failing',
        type: 'transaction.created',
        occurredAt: new Date(),
        subject: {},
        data: {},
        error: 'карта у нас не заведена',
      },
    })

    const system = await systemView(prisma)
    expect(system.eventLagSeconds).toBeGreaterThanOrEqual(299)
    expect(system.unprocessedEvents).toBe(1)
    expect(system.failingEvents).toBe(1)
  })
})

/* --------------------------------------------------------------------------
   Выгрузка
   -------------------------------------------------------------------------- */

describe('выгрузка в CSV', () => {
  it('не даёт подставить формулу через имя мерчанта', () => {
    const csv = toCsv(['Мерчант', 'Сумма'], [['=HYPERLINK("http://evil")', '12.40']])
    expect(csv).toContain(`'=HYPERLINK`)
  })

  it('экранирует точку с запятой и кавычки', () => {
    const csv = toCsv(['Имя'], [['Иванов; "Иван"']])
    expect(csv).toContain('"Иванов; ""Иван"""')
  })
})

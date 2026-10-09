/**
 * События: подпись, дедупликация, обработка, догон.
 *
 * Главная проверка этапа — **потеря вебхука не теряет данные**.
 * Доставка у эмитента одноразовая и без повторов, и единственное, что
 * стоит между нами и пропавшей тратой, — догон.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  applyEvent,
  catchUp,
  catchupStatus,
  drainQueue,
  ingest,
  isSecretBearing,
  markProcessed,
  redactForStorage,
  sign,
  verifyWebhook,
  EVENT_ID_HEADER,
  SIGNATURE_HEADER,
} from '@/server/events'
import { MockOxenClient } from '@/server/oxen'
import { applySettlement } from '@/server/services/mirror'
import { registerIncoming } from '@/server/services/deposits'
import { addCard, balanceOf, fakeLimitPort, prisma, remainingOfCard, resetDb, seed } from './helpers'

beforeEach(resetDb)
afterAll(async () => {
  await prisma.$disconnect()
})

const PASSED = { amlVerdict: 'PASSED' as const, amlRisk: 5 }
const SECRET = 'webhook-secret'

function headers(values: Record<string, string>): { get(name: string): string | null } {
  const lower = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]))
  return { get: (name: string) => lower.get(name.toLowerCase()) ?? null }
}

/* ==========================================================================
   Подпись
   ========================================================================== */

describe('подпись вебхука', () => {
  const body = '{"type":"transaction.created","data":{"id":"tx-1"}}'

  it('принимает подписанное по сырым байтам', () => {
    const result = verifyWebhook(
      body,
      headers({ [EVENT_ID_HEADER]: 'evt_1', [SIGNATURE_HEADER]: sign(body, SECRET) }),
      SECRET,
    )
    expect(result).toEqual({ ok: true, eventId: 'evt_1' })
  })

  it('подпись считается по байтам: пересобранный JSON её ломает', () => {
    // Отправитель подписал вот это тело, с пробелами как есть.
    const sent = '{\n  "type": "transaction.created",\n  "data": {"id": "tx-1"}\n}'
    const signature = sign(sent, SECRET)
    const head = headers({ [EVENT_ID_HEADER]: 'evt_1', [SIGNATURE_HEADER]: signature })

    // По сырым байтам сходится.
    expect(verifyWebhook(sent, head, SECRET).ok).toBe(true)

    // А по разобранному и собранному заново — нет: пробелы другие.
    // Поэтому тело нельзя брать через request.json().
    const reassembled = JSON.stringify(JSON.parse(sent))
    expect(reassembled).not.toBe(sent)
    expect(verifyWebhook(reassembled, head, SECRET)).toEqual({
      ok: false,
      reason: 'BAD_SIGNATURE',
    })
  })

  it('отсутствие заголовков — такой же отказ, как неверная подпись', () => {
    expect(verifyWebhook(body, headers({}), SECRET)).toEqual({ ok: false, reason: 'NO_EVENT_ID' })
    expect(verifyWebhook(body, headers({ [EVENT_ID_HEADER]: 'evt_1' }), SECRET)).toEqual({
      ok: false,
      reason: 'NO_SIGNATURE',
    })
  })

  it('чужой секрет не подходит', () => {
    const result = verifyWebhook(
      body,
      headers({ [EVENT_ID_HEADER]: 'evt_1', [SIGNATURE_HEADER]: sign(body, 'другой') }),
      SECRET,
    )
    expect(result).toEqual({ ok: false, reason: 'BAD_SIGNATURE' })
  })
})

/* ==========================================================================
   Одноразовые коды
   ========================================================================== */

describe('3DS-код не попадает в базу', () => {
  it('тело события с кодом не хранится вовсе', async () => {
    expect(isSecretBearing('challenge.requested')).toBe(true)

    const payload = { otp: '481902', amount: 4999, merchant: 'AMAZON' }
    expect(redactForStorage('challenge.requested', payload)).toEqual({ redacted: true })

    await ingest(prisma, {
      id: 'evt_3ds',
      type: 'challenge.requested',
      data: redactForStorage('challenge.requested', payload),
    })

    const stored = await prisma.oxenEvent.findUniqueOrThrow({ where: { id: 'evt_3ds' } })
    // Ни кода, ни чего-либо ещё из тела: выборочная зачистка полей
    // не годится — одно незачищенное поле означает пароль в дампе.
    expect(JSON.stringify(stored.data)).not.toContain('481902')
    expect(stored.data).toEqual({ redacted: true })
  })

  it('обычные события хранятся как есть', () => {
    const data = { id: 'tx-1', amount: 100 }
    expect(redactForStorage('transaction.created', data)).toBe(data)
  })
})

/* ==========================================================================
   Дедупликация
   ========================================================================== */

describe('дедупликация', () => {
  it('одно событие, пришедшее дважды, записывается один раз', async () => {
    const input = { id: 'evt_1', type: 'card.updated', data: { id: 'card_1' } }

    expect(await ingest(prisma, input)).toEqual({ stored: true, alreadyProcessed: false })
    expect(await ingest(prisma, input)).toEqual({ stored: false, alreadyProcessed: false })

    expect(await prisma.oxenEvent.count()).toBe(1)
  })

  it('повтор уже обработанного виден как обработанный', async () => {
    const input = { id: 'evt_1', type: 'card.updated', data: {} }
    await ingest(prisma, input)
    await markProcessed(prisma, 'evt_1')

    expect(await ingest(prisma, input)).toEqual({ stored: false, alreadyProcessed: true })
  })
})

/* ==========================================================================
   Обработка: событие → перечитать → применить
   ========================================================================== */

describe('обработка событий', () => {
  async function fundedCard(amount = 100000n) {
    const seeded = await seed()
    const cardId = await addCard({ userId: seeded.userId, isPrimary: true })
    await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-fund',
      addressId: seeded.addressId,
      receivedMinor: amount,
      ...PASSED,
    })

    // Карта заводится и у эмитента — события приходят с его
    // идентификатором, и по нему мы ищем свою.
    const oxen = new MockOxenClient()
    const holder = await oxen.createCardholder('cl_a', { fullName: 'Д' }, { key: 'k1' })
    const issued = await oxen.issueCard(holder.id, { limitMinor: amount }, { key: 'k2' })
    await prisma.card.update({ where: { id: cardId }, data: { oxenCardId: issued.id } })

    return { ...seeded, cardId, oxen, oxenCardId: issued.id }
  }

  it('авторизация ставит резерв и не создаёт проводку', async () => {
    const { userId, cardId, oxen, oxenCardId } = await fundedCard()
    const tx = oxen.simulateAuthorization(oxenCardId, {
      amountMinor: 12050n,
      localAmount: 11000n,
      localCurrency: 'EUR',
      merchantName: 'HOTEL ARTEMIDE ROMA',
    })

    const event = oxen.deliveredEvents().find((e) => e.type === 'transaction.created')!
    await ingest(prisma, { id: event.id, type: event.type, data: event.data })
    const outcome = await applyEvent({ prisma, oxen }, {
      id: event.id,
      type: event.type,
      data: event.data,
    })

    expect(outcome).toEqual({ kind: 'APPLIED', what: 'AUTHORIZATION' })
    expect(await remainingOfCard(cardId)).toBe(100000n - 12050n)
    // Деньги обещаны мерчанту, но не списаны: проводки нет.
    expect(await balanceOf(userId)).toBe(100000n)
    expect(await prisma.ledgerTransaction.count({ where: { type: 'SPEND' } })).toBe(0)

    const mirrored = await prisma.cardTransaction.findUniqueOrThrow({ where: { id: tx.id } })
    expect(mirrored.authorizedAmount).toBe(12050n)
    expect(mirrored.authorizedLocalAmount).toBe(11000n)
  })

  it('оседание создаёт проводку по сумме сеттлмента, а не авторизации', async () => {
    const { userId, cardId, oxen, oxenCardId } = await fundedCard()
    const tx = oxen.simulateAuthorization(oxenCardId, { amountMinor: 12050n, localAmount: 11000n, localCurrency: 'EUR' })
    const created = oxen.deliveredEvents().find((e) => e.type === 'transaction.created')!
    await applyEvent({ prisma, oxen }, { id: created.id, type: created.type, data: created.data })

    // Пока операция оседала, курс ушёл: списали больше.
    oxen.simulateSettlement(tx.id, 12180n)
    const updated = oxen.deliveredEvents().find((e) => e.type === 'transaction.updated')!
    const outcome = await applyEvent({ prisma, oxen }, {
      id: updated.id,
      type: updated.type,
      data: updated.data,
    })

    expect(outcome).toEqual({ kind: 'APPLIED', what: 'SPEND' })
    expect(await balanceOf(userId)).toBe(100000n - 12180n)
    expect(await remainingOfCard(cardId)).toBe(100000n - 12180n)

    // Чтение у эмитента затёрло сумму авторизации фактической.
    // У нас она сохранена из события и осталась прежней.
    const mirrored = await prisma.cardTransaction.findUniqueOrThrow({ where: { id: tx.id } })
    expect(mirrored.amountMinor).toBe(12180n)
    expect(mirrored.authorizedAmount).toBe(12050n)
    expect((await oxen.getTransaction(tx.id)).authorizedAmountMinor).toBe(12180n)
  })

  it('возврат проводится по фактически полученной сумме', async () => {
    const { userId, oxen, oxenCardId } = await fundedCard()
    oxen.simulateRefund(oxenCardId, { receivedMinor: 11840n, localAmount: 11000n, localCurrency: 'EUR' })

    const event = oxen.deliveredEvents().find((e) => e.type === 'transaction.created')!
    const outcome = await applyEvent({ prisma, oxen }, {
      id: event.id,
      type: event.type,
      data: event.data,
    })

    expect(outcome).toEqual({ kind: 'APPLIED', what: 'REFUND' })
    expect(await balanceOf(userId)).toBe(100000n + 11840n)
  })

  it('событие о карте применяется по ЧТЕНИЮ, а не по своему значению', async () => {
    const { cardId, oxen, oxenCardId } = await fundedCard()
    await oxen.freezeCard(oxenCardId)

    const event = oxen.deliveredEvents().filter((e) => e.type === 'card.updated').at(-1)!
    // В событии статус в их вокабуляре, в нижнем регистре.
    expect((event.data as { status: string }).status).toBe('locked')

    await applyEvent({ prisma, oxen }, { id: event.id, type: event.type, data: event.data })

    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } })
    expect(card.status).toBe('FROZEN')
    // Замораживали не мы и не из-за минуса — зачисление в плюс такую
    // карту не разморозит.
    expect(card.freezeReason).toBe('BY_ISSUER')
  })

  it('закрывающуюся карту событие не трогает', async () => {
    const { cardId, oxen, oxenCardId } = await fundedCard()
    await prisma.card.update({
      where: { id: cardId },
      data: { status: 'CLOSING', freezeReason: 'CLOSING' },
    })
    await oxen.freezeCard(oxenCardId)

    const event = oxen.deliveredEvents().filter((e) => e.type === 'card.updated').at(-1)!
    const outcome = await applyEvent({ prisma, oxen }, {
      id: event.id,
      type: event.type,
      data: event.data,
    })

    expect(outcome.kind).toBe('IGNORED')
    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } })
    // Иначе потерялось бы намерение закрыть карту и план переноса.
    expect(card.status).toBe('CLOSING')
  })

  it('незнакомый тип события не ломает очередь', async () => {
    const oxen = new MockOxenClient()
    const outcome = await applyEvent({ prisma, oxen }, {
      id: 'evt_x',
      type: 'dispute.opened',
      data: {},
    })
    expect(outcome.kind).toBe('IGNORED')
  })

  it('событие по незнакомой карте остаётся в очереди с понятной ошибкой', async () => {
    const oxen = new MockOxenClient()
    await ingest(prisma, {
      id: 'evt_unknown',
      type: 'transaction.created',
      data: { id: 'tx-1', cardId: 'card_нетуНас' },
    })

    const result = await drainQueue({ prisma, oxen })
    expect(result.failed).toBe(1)

    const stored = await prisma.oxenEvent.findUniqueOrThrow({ where: { id: 'evt_unknown' } })
    expect(stored.processedAt).toBeNull() // в очереди, не потеряно
    expect(stored.error).toContain('не заведена')
  })
})

/* ==========================================================================
   Догон — главное этого этапа
   ========================================================================== */

describe('догон', () => {
  async function fundedCard(amount = 100000n) {
    const seeded = await seed()
    const cardId = await addCard({ userId: seeded.userId, isPrimary: true })
    await registerIncoming(prisma, fakeLimitPort(), {
      chainTxId: 'tx-fund',
      addressId: seeded.addressId,
      receivedMinor: amount,
      ...PASSED,
    })
    const oxen = new MockOxenClient()
    const holder = await oxen.createCardholder('cl_a', { fullName: 'Д' }, { key: 'k1' })
    const issued = await oxen.issueCard(holder.id, { limitMinor: amount }, { key: 'k2' })
    await prisma.card.update({ where: { id: cardId }, data: { oxenCardId: issued.id } })
    return { ...seeded, cardId, oxen, oxenCardId: issued.id }
  }

  it('ПОТЕРЯННЫЙ ВЕБХУК НЕ ТЕРЯЕТ ДАННЫЕ', async () => {
    const { userId, cardId, oxen, oxenCardId } = await fundedCard()

    // Наш эндпоинт лежал: доставка одноразовая, повторов у них нет.
    oxen.dropNextWebhook()
    const tx = oxen.simulateAuthorization(oxenCardId, { amountMinor: 30000n })
    oxen.dropNextWebhook()
    oxen.simulateSettlement(tx.id, 30000n)

    // Вебхуком эти события не придут вовсе.
    expect(oxen.deliveredEvents().filter((e) => e.type.startsWith('transaction.'))).toHaveLength(0)
    expect(await balanceOf(userId)).toBe(100000n)

    // Догон их находит и применяет.
    const result = await catchUp({ prisma, oxen })

    expect(result.caughtUp).toBe(true)
    expect(result.failed).toBe(0)
    expect(await balanceOf(userId)).toBe(70000n)
    expect(await remainingOfCard(cardId)).toBe(70000n)
    expect(await prisma.ledgerTransaction.count({ where: { type: 'SPEND' } })).toBe(1)
  })

  it('на пустой базе проход проходит и отмечает, что догнали', async () => {
    // Самый первый запуск: событий нет, строки курсора ещё нет.
    // Догон обязан справиться — это нормальное состояние, а не сбой.
    const result = await catchUp({ prisma, oxen: new MockOxenClient() })

    expect(result.caughtUp).toBe(true)
    expect(result.stored).toBe(0)
    const status = await catchupStatus(prisma)
    expect(status.lastSyncedAt).not.toBeNull()
    expect(status.lastError).toBeNull()
  })

  it('повторная доставка не удваивает проводку', async () => {
    const { userId, oxen, oxenCardId } = await fundedCard()
    const tx = oxen.simulateAuthorization(oxenCardId, { amountMinor: 30000n })
    oxen.simulateSettlement(tx.id, 30000n)

    // Вебхук принёс событие и его же принёс догон — так бывает всегда.
    for (const event of oxen.deliveredEvents()) {
      await ingest(prisma, { id: event.id, type: event.type, data: event.data })
    }
    await drainQueue({ prisma, oxen })

    // Догон читает те же события заново.
    await catchUp({ prisma, oxen })
    await catchUp({ prisma, oxen })

    expect(await prisma.ledgerTransaction.count({ where: { type: 'SPEND' } })).toBe(1)
    expect(await balanceOf(userId)).toBe(70000n) // не 40 000
  })

  it('курсор переживает перезапуск и не перечитывает всё заново', async () => {
    const { oxen, oxenCardId } = await fundedCard()
    oxen.simulateAuthorization(oxenCardId, { amountMinor: 1000n })

    await catchUp({ prisma, oxen })
    const afterFirst = await prisma.eventCursor.findUniqueOrThrow({ where: { id: 'oxen' } })
    expect(afterFirst.cursor).not.toBeNull()

    const before = oxen.calls.filter((c) => c.op === 'listEvents').length
    await catchUp({ prisma, oxen })
    const after = oxen.calls.filter((c) => c.op === 'listEvents').length

    // Второй проход читает с сохранённого места: одна страница, пустая.
    expect(after - before).toBe(1)
  })

  it('оседание без авторизации достраивает зеркало без выдуманной суммы холда', async () => {
    const { userId, cardId } = await fundedCard()

    // Авторизацию мы не видели вовсе: событие о создании не дошло
    // и не дойдёт. Пришло сразу оседание.
    await applySettlement(prisma, {
      id: 'tx-lost',
      settledMinor: 30500n,
      fallback: { cardId, merchantName: 'CARREFOUR CITY 0391' },
    })

    const mirrored = await prisma.cardTransaction.findUniqueOrThrow({ where: { id: 'tx-lost' } })
    // Сумма холда НЕ подставляется фактической: мы её не видели,
    // и врать об этом нельзя — иначе курсовую разницу потом не
    // отличить от чаевых.
    expect(mirrored.authorizedAmount).toBeNull()
    expect(mirrored.amountMinor).toBe(30500n)
    expect(await balanceOf(userId)).toBe(100000n - 30500n)

    // Резерва не было — снимать нечего, и карта не ушла в минус
    // на величину несуществующего холда.
    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } })
    expect(card.pendingMinor).toBe(0n)
    expect(card.settledMinor).toBe(30500n)
  })

  it('индикатор отставания различает «не читали» и «не применили»', async () => {
    const { oxen, oxenCardId } = await fundedCard()
    oxen.simulateAuthorization(oxenCardId, { amountMinor: 1000n })
    await catchUp({ prisma, oxen })

    const healthy = await catchupStatus(prisma)
    expect(healthy.unprocessed).toBe(0)
    expect(healthy.failing).toBe(0)
    expect(healthy.lagSeconds).not.toBeNull()
    expect(healthy.lagSeconds!).toBeLessThan(5)

    // Событие пришло, но применить его не вышло — это другое
    // отставание, и лечится оно по-другому.
    await ingest(prisma, {
      id: 'evt_broken',
      type: 'transaction.created',
      data: { id: 'tx-x', cardId: 'card_нетуНас' },
    })
    await drainQueue({ prisma, oxen })

    const stuck = await catchupStatus(prisma)
    expect(stuck.unprocessed).toBe(1)
    expect(stuck.failing).toBe(1)
    expect(stuck.oldestUnprocessedAt).not.toBeNull()
  })

  it('сбой чтения страниц записывается и пробрасывается', async () => {
    const { oxen } = await fundedCard()
    oxen.failUnauthorized('listEvents', 5)

    await expect(catchUp({ prisma, oxen })).rejects.toThrow()

    const status = await catchupStatus(prisma)
    expect(status.lastError).toContain('UNAUTHORIZED')
  })
})

/**
 * Адаптер эмитента.
 *
 * Контрактная часть написана против **интерфейса**, а не против
 * заглушки: те же проверки должны пройти на песочнице, когда появится
 * доступ. Для этого они собраны в функцию, которой передаётся фабрика
 * клиента, — на этапе 8 к ней добавится второй вызов.
 *
 * Отдельно проверяется то, ради чего заглушка и существует: отказы.
 * Счастливый путь подтверждает только, что мы правильно прочитали
 * документацию.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cardStatusFromEvent,
  createOxenClient,
  isCardholderApproved,
  MockOxenClient,
  OxenConfigError,
  OxenError,
  OxenHttp,
  recoveryFor,
  retrying,
  retryDelayMs,
  Throttle,
  KNOWN_CODES,
  type OxenClient,
} from '@/server/oxen'
import { issuePort, limitPort, statePort } from '@/server/oxen/ports'
import { markDone, reserveIntent } from '@/server/db/intents'
import { prisma, resetDb } from './helpers'

/** Повторы без настоящих пауз: тесты не должны ждать по-настоящему. */
const instant = { sleep: async () => {}, maxRetries: 3 }

/* ==========================================================================
   Контракт. Эти проверки обязаны пройти и на песочнице.
   ========================================================================== */

function contractSuite(name: string, makeClient: () => OxenClient) {
  describe(`контракт адаптера (${name})`, () => {
    it('выпуск карты: картхолдер, карта, потолок при выпуске', async () => {
      const client = makeClient()
      const holder = await client.createCardholder(
        'cl_alpha',
        { fullName: 'Соколов Дмитрий' },
        { key: 'key-1' },
      )
      expect(holder.id.startsWith('chd_')).toBe(true)
      expect(holder.approved).toBe(true)

      const card = await client.issueCard(holder.id, { limitMinor: 60000n }, { key: 'key-2' })
      expect(card.id.startsWith('card_')).toBe(true)
      expect(card.status).toBe('ACTIVE')
      expect(card.limitMinor).toBe(60000n)

      const read = await client.getCard(card.id)
      expect(read.id).toBe(card.id)
      expect(read.limitMinor).toBe(60000n)
    })

    it('изменение лимита принимает АБСОЛЮТНОЕ значение', async () => {
      const client = makeClient()
      const holder = await client.createCardholder('cl_alpha', { fullName: 'Д' }, { key: 'k1' })
      const card = await client.issueCard(holder.id, { limitMinor: 60000n }, { key: 'k2' })

      const updated = await client.setCardLimit(card.id, 110000n)
      expect(updated.limitMinor).toBe(110000n) // потолок стал 1100, а не 600 + 1100
      expect((await client.getCard(card.id)).limitMinor).toBe(110000n)
    })

    it('повтор с тем же идемпотентным ключом не создаёт вторую карту', async () => {
      const client = makeClient()
      const holder = await client.createCardholder('cl_alpha', { fullName: 'Д' }, { key: 'k1' })

      const first = await client.issueCard(holder.id, { limitMinor: 1000n }, { key: 'same' })
      const second = await client.issueCard(holder.id, { limitMinor: 1000n }, { key: 'same' })

      expect(second.id).toBe(first.id)
    })

    it('заморозка, разморозка и отмена меняют статус', async () => {
      const client = makeClient()
      const holder = await client.createCardholder('cl_alpha', { fullName: 'Д' }, { key: 'k1' })
      const card = await client.issueCard(holder.id, { limitMinor: 1000n }, { key: 'k2' })

      expect((await client.freezeCard(card.id)).status).toBe('FROZEN')
      expect((await client.unfreezeCard(card.id)).status).toBe('ACTIVE')
      expect((await client.cancelCard(card.id)).status).toBe('CANCELED')
    })

    it('операция над отменённой картой отбивается CARD_TERMINAL', async () => {
      const client = makeClient()
      const holder = await client.createCardholder('cl_alpha', { fullName: 'Д' }, { key: 'k1' })
      const card = await client.issueCard(holder.id, { limitMinor: 1000n }, { key: 'k2' })
      await client.cancelCard(card.id)

      // Отмена необратима: ни лимит поменять, ни разморозить.
      await expect(client.setCardLimit(card.id, 2000n)).rejects.toMatchObject({
        code: KNOWN_CODES.CARD_TERMINAL,
      })
      await expect(client.unfreezeCard(card.id)).rejects.toMatchObject({
        code: KNOWN_CODES.CARD_TERMINAL,
      })
    })

    it('догон событий: пустая страница с курсором null означает «догнали»', async () => {
      const client = makeClient()
      const holder = await client.createCardholder('cl_alpha', { fullName: 'Д' }, { key: 'k1' })
      await client.issueCard(holder.id, { limitMinor: 1000n }, { key: 'k2' })

      const first = await client.listEvents(null)
      expect(first.items.length).toBeGreaterThan(0)
      // Непустой курсор означает «запросить ещё раз», а не «есть ещё».
      expect(first.nextCursor).not.toBeNull()

      const second = await client.listEvents(first.nextCursor)
      expect(second.items).toHaveLength(0)
      expect(second.nextCursor).toBeNull()
    })
  })
}

contractSuite('заглушка', () => retrying(new MockOxenClient(), instant))

/* ==========================================================================
   Отказы: то, ради чего заглушка и нужна.
   ========================================================================== */

describe('заглушка воспроизводит отказы', () => {
  async function withCard(mock: MockOxenClient) {
    const holder = await mock.createCardholder('cl_alpha', { fullName: 'Д' }, { key: 'k1' })
    const card = await mock.issueCard(holder.id, { limitMinor: 100000n }, { key: 'k2' })
    return { holder, card }
  }

  it('задержка KYB: пока картхолдер не одобрен, карта не выпускается', async () => {
    const mock = new MockOxenClient()
    const holder = await mock.createCardholder('cl_alpha', { fullName: 'Д' }, { key: 'k1' })
    mock.setKybDelay(holder.id, 2)

    await expect(
      mock.issueCard(holder.id, { limitMinor: 1000n }, { key: 'k2' }),
    ).rejects.toMatchObject({ code: 'CARDHOLDER_NOT_APPROVED' })

    // Статус подтягивается чтениями, и отображать его надо честно:
    // «на проверке», а не «готово».
    expect((await mock.getCardholder(holder.id)).approved).toBe(false)
    expect((await mock.getCardholder(holder.id)).approved).toBe(false)
    expect((await mock.getCardholder(holder.id)).approved).toBe(true)

    const card = await mock.issueCard(holder.id, { limitMinor: 1000n }, { key: 'k3' })
    expect(card.status).toBe('ACTIVE')
  })

  it('429 повторяется и доходит; пауза берётся из retryAfterSeconds', async () => {
    const mock = new MockOxenClient()
    const { card } = await withCard(mock)

    const sleeps: number[] = []
    const client = retrying(mock, { maxRetries: 3, sleep: async (ms) => void sleeps.push(ms) })

    mock.failRateLimited('setCardLimit', 2, 2) // два отказа подряд
    const updated = await client.setCardLimit(card.id, 50000n)

    expect(updated.limitMinor).toBe(50000n)
    expect(sleeps).toEqual([2000, 2000])
  })

  it('401 НЕ повторяется и переводит очередь в медленный режим', async () => {
    const mock = new MockOxenClient()
    const { card } = await withCard(mock)

    const throttle = new Throttle({ slowdownAfter: 1 })
    const client = retrying(mock, {
      ...instant,
      onUnauthorized: () => throttle.noteThrottleSignal(),
    })

    mock.failUnauthorized('setCardLimit', 5)
    const before = mock.calls.filter((c) => c.op === 'setCardLimit').length

    await expect(client.setCardLimit(card.id, 1000n)).rejects.toMatchObject({
      code: KNOWN_CODES.UNAUTHORIZED,
    })

    // Ровно одна попытка: повтор в цикле при троттлинге усугубляет.
    expect(mock.calls.filter((c) => c.op === 'setCardLimit').length).toBe(before + 1)
    expect(throttle.isSlowedDown).toBe(true)
  })

  it('502 PROVIDER_AMBIGUOUS на изменяющем вызове повторяется', async () => {
    const mock = new MockOxenClient()
    const { card } = await withCard(mock)
    const client = retrying(mock, instant)

    mock.failAmbiguous('setCardLimit', 1)
    const updated = await client.setCardLimit(card.id, 70000n)
    expect(updated.limitMinor).toBe(70000n)
  })

  it('502 PROVIDER_AMBIGUOUS на выпуске карты НЕ повторяется', async () => {
    const mock = new MockOxenClient()
    const holder = await mock.createCardholder('cl_alpha', { fullName: 'Д' }, { key: 'k1' })
    const client = retrying(mock, instant)

    mock.failAmbiguous('issueCard', 1)
    const before = mock.calls.filter((c) => c.op === 'issueCard').length

    await expect(
      client.issueCard(holder.id, { limitMinor: 1000n }, { key: 'k2' }),
    ).rejects.toMatchObject({ code: KNOWN_CODES.PROVIDER_AMBIGUOUS })

    // Повтор создал бы вторую карту. Здесь положено перечитывать.
    expect(mock.calls.filter((c) => c.op === 'issueCard').length).toBe(before + 1)
  })

  it('502 CARD_UNRECORDED не повторяется никогда', async () => {
    const mock = new MockOxenClient()
    const holder = await mock.createCardholder('cl_alpha', { fullName: 'Д' }, { key: 'k1' })
    const client = retrying(mock, instant)

    mock.failCardUnrecorded(5)
    const before = mock.calls.filter((c) => c.op === 'issueCard').length

    await expect(
      client.issueCard(holder.id, { limitMinor: 1000n }, { key: 'k2' }),
    ).rejects.toMatchObject({ code: KNOWN_CODES.CARD_UNRECORDED })

    expect(mock.calls.filter((c) => c.op === 'issueCard').length).toBe(before + 1)
  })

  it('залог компании проверяется РАНЬШЕ потолка карты', async () => {
    const mock = new MockOxenClient()
    const { card } = await withCard(mock)
    mock.setPool('cl_alpha', 5000n) // в пуле 50, на карте 1000

    const declined = mock.simulateSpend(card.id, 10000n)
    expect(declined.approved).toBe(false)
    // Отказ по залогу ничего не говорит об остатке карты — на этом
    // построены наши тексты для пользователя.
    expect(declined.declineReason).toBe(KNOWN_CODES.ACCOUNT_CREDIT_LIMIT_EXCEEDED)

    const approved = mock.simulateSpend(card.id, 4000n)
    expect(approved.approved).toBe(true)
  })

  it('потолок карты не пускает трату выше остатка', async () => {
    const mock = new MockOxenClient()
    const { card } = await withCard(mock)

    expect(mock.simulateSpend(card.id, 90000n).approved).toBe(true)
    // Потрачено 900 из 1000: чек на 998 не пройдёт.
    const declined = mock.simulateSpend(card.id, 99800n)
    expect(declined.approved).toBe(false)
    expect(declined.declineReason).toBe('card_limit_exceeded')
    // Потолок при этом не изменился — он никогда не меняется от трат.
    expect(mock.cardState(card.id).limitMinor).toBe(100000n)
  })

  it('перерасход: списание пришло выше одобренного', async () => {
    const mock = new MockOxenClient()
    const { card } = await withCard(mock)

    const tx = mock.simulateOverspend(card.id, 12050n, 12180n)

    // Счётчик потраченного ушёл на фактическую сумму.
    expect(mock.cardState(card.id).spentMinor).toBe(12180n)
    // А чтение транзакции затёрло исходную авторизацию фактической
    // суммой — ровно поэтому её надо сохранять из события.
    const read = await mock.getTransaction(tx.id)
    expect(read.authorizedAmountMinor).toBe(12180n)

    // В событии о создании транзакции сумма — это ещё сумма
    // авторизации. Она живёт только здесь: чтение её затирает.
    const created = mock
      .deliveredEvents()
      .find((event) => event.type === 'transaction.created')
    expect((created?.data as { amount: bigint }).amount).toBe(12050n)
  })

  it('потерянный вебхук: событие достаётся только догоном', async () => {
    const mock = new MockOxenClient()
    const lost = mock.pushUndeliveredEvent('transaction.created', { id: 'tx-1' })

    // Доставка одноразовая, без ретраев: вебхуком это событие не придёт.
    expect(mock.deliveredEvents().some((event) => event.id === lost.id)).toBe(false)
    // Догон его находит — поэтому он обязателен с первого дня.
    const page = await mock.listEvents(null)
    expect(page.items.some((event) => event.id === lost.id)).toBe(true)
  })
})

/* ==========================================================================
   Правила повтора и троттлинг
   ========================================================================== */

describe('таксономия ошибок', () => {
  const err = (code: string, status = 502) =>
    new OxenError({ code, message: '', httpStatus: status })

  it('неизвестный код не повторяется, включая любой 5xx', () => {
    expect(recoveryFor(err('WHAT_IS_THIS', 500), 'MUTATE')).toBe('REREAD')
    expect(recoveryFor(err('WHAT_IS_THIS', 503), 'CREATE')).toBe('REREAD')
    expect(recoveryFor(err('WHAT_IS_THIS', 500), 'READ')).toBe('STOP')
  })

  it('PROVIDER_AMBIGUOUS зависит от рода операции', () => {
    expect(recoveryFor(err(KNOWN_CODES.PROVIDER_AMBIGUOUS), 'MUTATE')).toBe('RETRY')
    expect(recoveryFor(err(KNOWN_CODES.PROVIDER_AMBIGUOUS), 'CREATE')).toBe('REREAD')
  })

  it('CARD_UNRECORDED и 401 останавливают всегда', () => {
    expect(recoveryFor(err(KNOWN_CODES.CARD_UNRECORDED), 'CREATE')).toBe('STOP')
    expect(recoveryFor(err(KNOWN_CODES.UNAUTHORIZED, 401), 'READ')).toBe('STOP')
  })

  it('пауза берётся из подсказки, иначе растёт с ограничением', () => {
    const withHint = new OxenError({
      code: KNOWN_CODES.PROVIDER_RATE_LIMITED,
      message: '',
      httpStatus: 429,
      retryAfterSeconds: 7,
    })
    expect(retryDelayMs(withHint, 1)).toBe(7000)

    const plain = err(KNOWN_CODES.LIMIT_UPDATE_IN_PROGRESS, 409)
    expect(retryDelayMs(plain, 1)).toBe(500)
    expect(retryDelayMs(plain, 2)).toBe(1000)
    expect(retryDelayMs(plain, 20)).toBe(30_000) // потолок
  })
})

describe('троттлинг исходящих', () => {
  it('выдерживает зазор между запросами', async () => {
    let now = 0
    const slept: number[] = []
    const throttle = new Throttle(
      { minIntervalMs: 100, concurrency: 1 },
      {
        now: () => now,
        sleep: async (ms) => {
          slept.push(ms)
          now += ms
        },
      },
    )

    await throttle.run(async () => 'a')
    await throttle.run(async () => 'b')
    await throttle.run(async () => 'c')

    expect(slept).toEqual([100, 100])
  })

  it('серия 401 замедляет очередь, разбор возвращает темп', () => {
    const throttle = new Throttle({ minIntervalMs: 100, slowdownAfter: 2, slowdownFactor: 4 })
    expect(throttle.interval).toBe(100)

    throttle.noteThrottleSignal()
    expect(throttle.isSlowedDown).toBe(false)
    throttle.noteThrottleSignal()
    expect(throttle.isSlowedDown).toBe(true)
    expect(throttle.interval).toBe(400)

    throttle.resume()
    expect(throttle.interval).toBe(100)
  })
})

/* ==========================================================================
   HTTP-клиент
   ========================================================================== */

describe('HTTP-клиент', () => {
  function fakeFetch(responses: { status: number; body: unknown }[]) {
    const calls: { url: string; init: RequestInit }[] = []
    let index = 0
    const impl = (async (url: URL | string, init: RequestInit) => {
      calls.push({ url: String(url), init })
      const response = responses[Math.min(index, responses.length - 1)]!
      index += 1
      return {
        ok: response.status < 400,
        status: response.status,
        text: async () => JSON.stringify(response.body),
      } as Response
    }) as unknown as typeof fetch
    return { impl, calls }
  }

  const config = (fetchImpl: typeof fetch, log?: (l: string, f: Record<string, unknown>) => void) => ({
    baseUrl: 'https://api.sbx.oxen.finance/v1/card',
    apiKey: 'test-key',
    fetchImpl,
    sleep: async () => {},
    ...(log ? { log } : {}),
  })

  it('разбирает конверт и логирует requestId', async () => {
    const { impl } = fakeFetch([
      { status: 200, body: { data: { id: 'card_1', status: 'ACTIVE' }, _metadata: { requestId: 'req_42' } } },
    ])
    const logged: Record<string, unknown>[] = []
    const http = new OxenHttp(config(impl, (_line, fields) => logged.push(fields)))

    const data = await http.request({ method: 'GET', path: '/cards/card_1', kind: 'READ' })

    expect(data).toEqual({ id: 'card_1', status: 'ACTIVE' })
    // requestId логируется и на успехе: искать его задним числом негде.
    expect(logged[0]?.requestId).toBe('req_42')
  })

  it('кладёт ключ идемпотентности только когда он задан', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { data: {} } }])
    const http = new OxenHttp(config(impl, () => {}))

    await http.request({ method: 'POST', path: '/x', kind: 'CREATE', idempotencyKey: 'abc' })
    await http.request({ method: 'PUT', path: '/y', kind: 'MUTATE' })

    expect((calls[0]?.init.headers as Record<string, string>)['Idempotency-Key']).toBe('abc')
    expect((calls[1]?.init.headers as Record<string, string>)['Idempotency-Key']).toBeUndefined()
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
  })

  it('повторяет 429 и доходит до ответа', async () => {
    const { impl, calls } = fakeFetch([
      {
        status: 429,
        body: {
          error: { code: KNOWN_CODES.PROVIDER_RATE_LIMITED, params: { retryAfterSeconds: 1 } },
          _metadata: { requestId: 'req_1' },
        },
      },
      { status: 200, body: { data: { ok: true } } },
    ])
    const http = new OxenHttp(config(impl, () => {}))

    expect(await http.request({ method: 'PUT', path: '/z', kind: 'MUTATE' })).toEqual({ ok: true })
    expect(calls).toHaveLength(2)
  })

  it('401 не повторяет и замедляет очередь', async () => {
    const { impl, calls } = fakeFetch([{ status: 401, body: {} }])
    const http = new OxenHttp(config(impl, () => {}), new Throttle({ slowdownAfter: 1 }))

    await expect(http.request({ method: 'GET', path: '/z', kind: 'READ' })).rejects.toMatchObject({
      code: KNOWN_CODES.UNAUTHORIZED,
    })
    expect(calls).toHaveLength(1)
    expect(http.throttle.isSlowedDown).toBe(true)
  })

  it('неизвестный 5xx не повторяется', async () => {
    const { impl, calls } = fakeFetch([{ status: 503, body: { error: { code: 'WAT' } } }])
    const http = new OxenHttp(config(impl, () => {}))

    await expect(http.request({ method: 'PUT', path: '/z', kind: 'MUTATE' })).rejects.toMatchObject({
      code: 'WAT',
    })
    expect(calls).toHaveLength(1)
  })

  it('ответ без разбираемого тела ошибки не попадает в allow-list', async () => {
    const { impl, calls } = fakeFetch([{ status: 500, body: '<html>502 Bad Gateway</html>' }])
    const http = new OxenHttp(config(impl, () => {}))

    await expect(http.request({ method: 'PUT', path: '/z', kind: 'MUTATE' })).rejects.toMatchObject({
      code: 'HTTP_500',
    })
    expect(calls).toHaveLength(1)
  })
})

/* ==========================================================================
   Словарь статусов и выбор режима
   ========================================================================== */

describe('вокабуляр и режимы', () => {
  it('статус события переводится в статус чтения', () => {
    expect(cardStatusFromEvent('active')).toBe('ACTIVE')
    expect(cardStatusFromEvent('locked')).toBe('FROZEN')
    expect(cardStatusFromEvent('canceled')).toBe('CANCELED')
    // Неизвестное значение не угадывается: повод перечитать карту.
    expect(cardStatusFromEvent('whatever')).toBeNull()
  })

  it('одобренным считается только явный APPROVED', () => {
    expect(isCardholderApproved('APPROVED')).toBe(true)
    expect(isCardholderApproved('approved')).toBe(true)
    expect(isCardholderApproved('PENDING')).toBe(false)
    expect(isCardholderApproved('')).toBe(false)
  })

  it('режим по умолчанию — заглушка, неизвестный режим — ошибка', () => {
    expect(createOxenClient({})).toBeDefined()
    expect(() => createOxenClient({ OXEN_MODE: 'prod' })).toThrow(
      OxenConfigError,
    )
    // Боевой режим без ключа не поднимается молча.
    expect(() => createOxenClient({ OXEN_MODE: 'sandbox' })).toThrow(
      OxenConfigError,
    )
  })
})

/* ==========================================================================
   Намерения и порты домена
   ========================================================================== */

describe('идемпотентные ключи', () => {
  beforeEach(resetDb)
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('повторное намерение по тому же предмету отдаёт тот же ключ', async () => {
    const first = await reserveIntent(prisma, {
      service: 'OXEN',
      operation: 'ISSUE_CARD',
      subjectType: 'CARD',
      subjectId: 'slot-1',
    })
    const second = await reserveIntent(prisma, {
      service: 'OXEN',
      operation: 'ISSUE_CARD',
      subjectType: 'CARD',
      subjectId: 'slot-1',
    })

    // Новый ключ под тот же предмет означал бы вторую карту.
    expect(second.key).toBe(first.key)
    expect(second.completedResultId).toBeNull()

    await markDone(prisma, first.key, 'card_abc')
    const third = await reserveIntent(prisma, {
      service: 'OXEN',
      operation: 'ISSUE_CARD',
      subjectType: 'CARD',
      subjectId: 'slot-1',
    })
    expect(third.completedResultId).toBe('card_abc')
  })

  it('порт выпуска не выпускает вторую карту при повторе', async () => {
    const mock = new MockOxenClient()
    const holder = await mock.createCardholder('cl_alpha', { fullName: 'Д' }, { key: 'k1' })
    const port = issuePort(mock, prisma, 'slot-1')

    const first = await port.issueCard({ oxenCardholderId: holder.id, limitMinor: 0n })
    const second = await port.issueCard({ oxenCardholderId: holder.id, limitMinor: 0n })

    expect(second.oxenCardId).toBe(first.oxenCardId)
    // Второй раз вызова на выпуск не было — была перечитка.
    expect(mock.calls.filter((c) => c.op === 'issueCard')).toHaveLength(1)
    expect(mock.calls.filter((c) => c.op === 'getCard')).toHaveLength(1)
  })

  it('отказ выпуска записывается в намерение, ключ сохраняется', async () => {
    const mock = new MockOxenClient()
    const holder = await mock.createCardholder('cl_alpha', { fullName: 'Д' }, { key: 'k1' })
    const port = issuePort(mock, prisma, 'slot-1')

    mock.failCardUnrecorded(1)
    await expect(
      port.issueCard({ oxenCardholderId: holder.id, limitMinor: 0n }),
    ).rejects.toMatchObject({ code: KNOWN_CODES.CARD_UNRECORDED })

    const intent = await prisma.outboundIntent.findFirstOrThrow({ where: { subjectId: 'slot-1' } })
    expect(intent.status).toBe('FAILED')
    // Повтор пойдёт с ТЕМ ЖЕ ключом: иначе эмитент создаст вторую карту.
    const again = await reserveIntent(prisma, {
      service: 'OXEN',
      operation: 'ISSUE_CARD',
      subjectType: 'CARD',
      subjectId: 'slot-1',
    })
    expect(again.key).toBe(intent.key)
  })

  it('порты лимита и состояния переводят вызовы домена в вызовы эмитента', async () => {
    const mock = new MockOxenClient()
    const holder = await mock.createCardholder('cl_alpha', { fullName: 'Д' }, { key: 'k1' })
    const card = await mock.issueCard(holder.id, { limitMinor: 0n }, { key: 'k2' })

    await limitPort(mock).setLimit(card.id, 50000n)
    expect(mock.cardState(card.id).limitMinor).toBe(50000n)

    const state = statePort(mock)
    await state.freeze(card.id)
    expect(mock.cardState(card.id).status).toBe('FROZEN')
    await state.unfreeze(card.id)
    expect(mock.cardState(card.id).status).toBe('ACTIVE')
    await state.cancel(card.id)
    expect(mock.cardState(card.id).status).toBe('CANCELED')
  })
})

describe('заглушка не ходит в сеть', () => {
  it('ни одного вызова fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const client = retrying(new MockOxenClient(), instant)
    const holder = await client.createCardholder('cl_alpha', { fullName: 'Д' }, { key: 'k1' })
    await client.issueCard(holder.id, { limitMinor: 1000n }, { key: 'k2' })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

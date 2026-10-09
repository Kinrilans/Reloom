/**
 * Адаптеры крипто-контура: сервис адресов и проверка происхождения.
 *
 * Контрактная часть написана против **интерфейсов**, а не против
 * заглушек: те же проверки должны пройти на живом API, когда появится
 * доступ. Отдельно проверяется то, ради чего заглушки и существуют, —
 * отказы.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createWalletClient,
  MockWalletClient,
  recoveryFor as walletRecovery,
  retrying as walletRetrying,
  WalletConfigError,
  WalletError,
  WalletHttp,
  CODES as WALLET_CODES,
  type WalletClient,
} from '@/server/wallet'
import { resolveRefund, sendRefundOnce } from '@/server/wallet/ports'
import {
  AmlConfigError,
  AmlError,
  createAmlClient,
  isUnavailable,
  MockAmlClient,
  CODES as AML_CODES,
} from '@/server/aml'
import { prisma, resetDb } from './helpers'

const instant = { maxRetries: 3, sleep: async () => {} }

/* ==========================================================================
   Контракт сервиса адресов
   ========================================================================== */

function walletContract(name: string, makeClient: () => WalletClient) {
  describe(`контракт сервиса адресов (${name})`, () => {
    it('отдаёт пары «монета + сеть»', async () => {
      const assets = await makeClient().listAssets()
      expect(assets.length).toBeGreaterThan(0)
      for (const asset of assets) {
        // Пара неразрывна: перевод не той монетой теряется так же,
        // как перевод не в той сети.
        expect(asset.network).toBeTruthy()
        expect(asset.asset).toBeTruthy()
      }
      // Сеть, требующая memo, помечена: без memo перевод в ней теряется.
      expect(assets.some((a) => a.requiresMemo)).toBe(true)
    })

    it('выдаёт адрес под пару и под конкретного пользователя', async () => {
      const client = makeClient()
      const address = await client.createAddress(
        { network: 'tron', asset: 'USDT', reference: 'usr-1' },
        { key: 'k1' },
      )

      expect(address.id).toBeTruthy()
      expect(address.address).toBeTruthy()
      expect(address.network).toBe('tron')
      expect(address.asset).toBe('USDT')
    })

    it('повтор с тем же ключом не заводит второй адрес', async () => {
      const client = makeClient()
      const first = await client.createAddress(
        { network: 'tron', asset: 'USDT', reference: 'usr-1' },
        { key: 'same' },
      )
      const second = await client.createAddress(
        { network: 'tron', asset: 'USDT', reference: 'usr-1' },
        { key: 'same' },
      )
      expect(second.id).toBe(first.id)
      expect(second.address).toBe(first.address)
    })

    it('сеть с memo отдаёт его вместе с адресом', async () => {
      const client = makeClient()
      const address = await client.createAddress(
        { network: 'ton', asset: 'USDT', reference: 'usr-1' },
        { key: 'k1' },
      )
      expect(address.memo).toBeTruthy()
    })
  })
}

walletContract('заглушка', () => walletRetrying(new MockWalletClient(), instant))

/* ==========================================================================
   Приход средств
   ========================================================================== */

describe('приход средств', () => {
  async function addressed() {
    const mock = new MockWalletClient()
    const address = await mock.createAddress(
      { network: 'tron', asset: 'USDT', reference: 'usr-1' },
      { key: 'k1' },
    )
    return { mock, address }
  }

  it('поступление видно по адресу, и по нему известен владелец', async () => {
    const { mock, address } = await addressed()

    const transfer = mock.simulateIncoming({
      addressId: address.id,
      amountMinor: 60000n,
      fromAddress: 'TSenderAddress',
    })

    const read = await mock.getIncoming(transfer.chainTxId)
    expect(read.addressId).toBe(address.id)
    expect(read.amountMinor).toBe(60000n)
    // Адрес отправителя — единственный возможный получатель возврата.
    // Сохраняется при получении: задним числом не восстановить.
    expect(read.fromAddress).toBe('TSenderAddress')
    expect(read.confirmations).toBe(0)
  })

  it('подтверждения сети набираются и читаются', async () => {
    const { mock, address } = await addressed()
    const transfer = mock.simulateIncoming({ addressId: address.id, amountMinor: 60000n })

    expect((await mock.getIncoming(transfer.chainTxId)).confirmations).toBe(0)
    mock.advanceConfirmations(transfer.chainTxId, 3)
    expect((await mock.getIncoming(transfer.chainTxId)).confirmations).toBe(3)
  })

  it('лента поступлений заканчивается пустой страницей', async () => {
    const { mock, address } = await addressed()
    mock.simulateIncoming({ addressId: address.id, amountMinor: 1000n })

    const first = await mock.listIncoming(null)
    expect(first.items).toHaveLength(1)
    const second = await mock.listIncoming(first.nextCursor)
    expect(second.items).toHaveLength(0)
    expect(second.nextCursor).toBeNull()
  })
})

/* ==========================================================================
   Возврат и уничтожение адреса
   ========================================================================== */

describe('возврат отправителю', () => {
  beforeEach(resetDb)
  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function held() {
    const mock = new MockWalletClient()
    const address = await mock.createAddress(
      { network: 'tron', asset: 'USDT', reference: 'usr-1' },
      { key: 'addr' },
    )
    const transfer = mock.simulateIncoming({
      addressId: address.id,
      amountMinor: 60000n,
      fromAddress: 'TSenderAddress',
    })
    return { mock, address, transfer }
  }

  it('уходит на адрес отправителя, комиссию сети удерживает сервис', async () => {
    const { mock, transfer } = await held()

    const outcome = await sendRefundOnce(mock, prisma, 'dep-1', {
      chainTxId: transfer.chainTxId,
      toAddress: transfer.fromAddress!,
    })

    expect(outcome.unresolved).toBe(false)
    expect(outcome.refund?.status).toBe('SENT')
    expect(outcome.refund?.toAddress).toBe('TSenderAddress')
    // Комиссию сети удерживает сервис; нашей комиссии нет — денег мы
    // не получили, услуги не оказали.
    expect(outcome.refund?.networkFeeMinor).toBe(100n)
    expect(outcome.refund?.sentMinor).toBe(59900n)
  })

  it('адрес после возврата уничтожается и больше не принимает денег', async () => {
    const { mock, address, transfer } = await held()

    await sendRefundOnce(mock, prisma, 'dep-1', {
      chainTxId: transfer.chainTxId,
      toAddress: transfer.fromAddress!,
    })

    expect(mock.addressState(address.id).burned).toBe(true)
    // Пополнять по уничтоженному адресу нельзя: он выведен из
    // обращения навсегда.
    expect(() => mock.simulateIncoming({ addressId: address.id, amountMinor: 1000n })).toThrow(
      WalletError,
    )
  })

  it('повторный вызов не отправляет деньги второй раз', async () => {
    const { mock, transfer } = await held()
    const input = { chainTxId: transfer.chainTxId, toAddress: transfer.fromAddress! }

    const first = await sendRefundOnce(mock, prisma, 'dep-1', input)
    const second = await sendRefundOnce(mock, prisma, 'dep-1', input)

    expect(second.refund?.id).toBe(first.refund?.id)
    // Второй отправки не было — была перечитка.
    expect(mock.calls.filter((c) => c.op === 'sendRefund')).toHaveLength(1)
    expect(mock.calls.filter((c) => c.op === 'getRefund')).toHaveLength(1)
  })

  it('деньги ушли, а ответ не дошёл: не повторяем, выясняем чтением', async () => {
    const { mock, transfer } = await held()
    const input = { chainTxId: transfer.chainTxId, toAddress: transfer.fromAddress! }

    mock.failAfterSendingRefund(1)
    const outcome = await sendRefundOnce(mock, prisma, 'dep-1', input)

    // Состояние неизвестно, и это честный результат: повторять нельзя.
    expect(outcome.unresolved).toBe(true)
    expect(outcome.refund).toBeUndefined()
    expect(mock.calls.filter((c) => c.op === 'sendRefund')).toHaveLength(1)

    // Единственный допустимый способ разобраться — прочитать.
    const resolved = await resolveRefund(prisma, 'dep-1', async () =>
      mock.findRefundByChainTx(transfer.chainTxId),
    )
    expect(resolved.unresolved).toBe(false)
    expect(resolved.refund?.status).toBe('SENT')

    // И после этого повторная отправка не происходит.
    const again = await sendRefundOnce(mock, prisma, 'dep-1', input)
    expect(again.refund?.id).toBe(resolved.refund?.id)
    expect(mock.calls.filter((c) => c.op === 'sendRefund')).toHaveLength(1)
  })

  it('намерение записано до отправки и переживает отказ', async () => {
    const { mock, transfer } = await held()
    mock.failNetwork('sendRefund', 1)

    const outcome = await sendRefundOnce(mock, prisma, 'dep-1', {
      chainTxId: transfer.chainTxId,
      toAddress: transfer.fromAddress!,
    })
    expect(outcome.unresolved).toBe(true)

    const intent = await prisma.outboundIntent.findFirstOrThrow({
      where: { service: 'WALLET', subjectId: 'dep-1' },
    })
    expect(intent.status).toBe('FAILED')
    expect(intent.operation).toBe('SEND_REFUND')
  })
})

/* ==========================================================================
   Отказы сервиса адресов
   ========================================================================== */

describe('сервис адресов ломается', () => {
  it('«слишком часто» повторяется на чтении', async () => {
    const mock = new MockWalletClient()
    const sleeps: number[] = []
    const client = walletRetrying(mock, { maxRetries: 3, sleep: async (ms) => void sleeps.push(ms) })

    mock.failRateLimited('listAssets', 2, 2)
    const assets = await client.listAssets()

    expect(assets.length).toBeGreaterThan(0)
    expect(sleeps).toEqual([2000, 2000])
  })

  it('создающий вызов не повторяется НИКОГДА', async () => {
    const mock = new MockWalletClient()
    const client = walletRetrying(mock, instant)

    // Даже «слишком часто» — повторяемый в любом другом месте — здесь
    // не повторяется: ответ неоднозначен, а вызов двигает деньги.
    mock.failRateLimited('sendRefund', 1, 5)
    await expect(
      client.sendRefund({ chainTxId: 'tx', toAddress: 'T' }, { key: 'k' }),
    ).rejects.toThrow(WalletError)
    expect(mock.calls.filter((c) => c.op === 'sendRefund')).toHaveLength(1)

    mock.failNetwork('createAddress', 5)
    await expect(
      client.createAddress({ network: 'tron', asset: 'USDT', reference: 'u' }, { key: 'k2' }),
    ).rejects.toThrow(WalletError)
    expect(mock.calls.filter((c) => c.op === 'createAddress')).toHaveLength(1)
  })

  it('правила повтора: создающее — только перечитать', () => {
    const rateLimited = new WalletError({
      code: WALLET_CODES.RATE_LIMITED,
      message: '',
      httpStatus: 429,
    })
    expect(walletRecovery(rateLimited, 'READ')).toBe('RETRY')
    expect(walletRecovery(rateLimited, 'CREATE')).toBe('REREAD')

    const unknown = new WalletError({ code: 'WAT', message: '', httpStatus: 500 })
    expect(walletRecovery(unknown, 'READ')).toBe('STOP')
    expect(walletRecovery(unknown, 'CREATE')).toBe('REREAD')
  })

  it('недоступность сервиса не повторяется вслепую', async () => {
    const mock = new MockWalletClient()
    const client = walletRetrying(mock, instant)
    mock.failUnavailable('listAssets', 5)

    await expect(client.listAssets()).rejects.toMatchObject({ code: 'HTTP_503' })
    expect(mock.calls.filter((c) => c.op === 'listAssets')).toHaveLength(1)
  })
})

/* ==========================================================================
   HTTP сервиса адресов
   ========================================================================== */

describe('HTTP сервиса адресов', () => {
  function fakeFetch(responses: ({ status: number; body: unknown } | 'throw')[]) {
    const calls: { url: string; init: RequestInit }[] = []
    let index = 0
    const impl = (async (url: URL | string, init: RequestInit) => {
      calls.push({ url: String(url), init })
      const next = responses[Math.min(index, responses.length - 1)]!
      index += 1
      if (next === 'throw') throw new Error('socket hang up')
      return {
        ok: next.status < 400,
        status: next.status,
        text: async () => JSON.stringify(next.body),
      } as Response
    }) as unknown as typeof fetch
    return { impl, calls }
  }

  const config = (fetchImpl: typeof fetch) => ({
    baseUrl: 'https://new.cryptocurrencyapi.net',
    apiKey: 'secret',
    fetchImpl,
    sleep: async () => {},
    log: () => {},
  })

  it('оборванное соединение на создающем вызове не повторяется', async () => {
    const { impl, calls } = fakeFetch(['throw'])
    const http = new WalletHttp(config(impl))

    await expect(
      http.request({ method: 'POST', path: '/refunds', kind: 'CREATE', idempotencyKey: 'k' }),
    ).rejects.toMatchObject({ code: WALLET_CODES.NETWORK })
    expect(calls).toHaveLength(1)
  })

  it('оборванное соединение на чтении повторяется', async () => {
    const { impl, calls } = fakeFetch(['throw', { status: 200, body: { ok: true } }])
    const http = new WalletHttp(config(impl))

    expect(await http.request({ method: 'GET', path: '/incoming', kind: 'READ' })).toEqual({
      ok: true,
    })
    expect(calls).toHaveLength(2)
  })

  it('429 замедляет очередь и повторяется', async () => {
    const { impl, calls } = fakeFetch([
      { status: 429, body: { retryAfterSeconds: 1 } },
      { status: 200, body: { ok: true } },
    ])
    const http = new WalletHttp(config(impl))

    await http.request({ method: 'GET', path: '/incoming', kind: 'READ' })
    expect(calls).toHaveLength(2)
  })

  it('ключ уходит заголовком и не попадает в лог', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: {} }])
    const logged: Record<string, unknown>[] = []
    const http = new WalletHttp({ ...config(impl), log: (_l, f) => logged.push(f) })

    await http.request({ method: 'GET', path: '/assets', kind: 'READ' })

    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer secret')
    // В логе только маршрут и статус: ключ этого сервиса отправляет
    // деньги, и в логах ему делать нечего.
    expect(JSON.stringify(logged)).not.toContain('secret')
  })
})

/* ==========================================================================
   Проверка происхождения
   ========================================================================== */

describe('проверка происхождения средств', () => {
  const request = {
    chainTxId: 'tx-1',
    network: 'tron',
    asset: 'USDT',
    amountMinor: 60000n,
    fromAddress: 'TSender',
  }

  it('низкая оценка — прошло', async () => {
    const aml = new MockAmlClient(70)
    aml.setRisk('tx-1', 5)

    const result = await aml.screen(request)
    expect(result.verdict).toBe('PASSED')
    expect(result.risk).toBe(5)
  })

  it('оценка выше порога — не прошло', async () => {
    const aml = new MockAmlClient(70)
    aml.setRisk('tx-1', 71)

    const result = await aml.screen(request)
    expect(result.verdict).toBe('FAILED')
    expect(result.risk).toBe(71)
  })

  it('порог — дело настроек, оценку мы не считаем', async () => {
    const strict = new MockAmlClient(10)
    const lax = new MockAmlClient(90)
    strict.setRisk('tx-1', 50)
    lax.setRisk('tx-1', 50)

    // Одна и та же оценка, разные пороги — разные исходы. Сама оценка
    // приходит готовой и нами не пересчитывается.
    expect((await strict.screen(request)).verdict).toBe('FAILED')
    expect((await lax.screen(request)).verdict).toBe('PASSED')
  })

  it('сервис не ответил — это отдельный исход, а не отказ', async () => {
    const aml = new MockAmlClient(70)
    aml.failUnavailable(1)

    const result = await aml.screen(request)
    expect(result.verdict).toBe('UNAVAILABLE')
    // Про деньги это не говорит ничего: ни «можно», ни «нельзя».
    expect(result.risk).toBeUndefined()
    expect(result.unavailableReason).toBe(AML_CODES.NETWORK)

    // Следующая попытка уже отвечает.
    expect((await aml.screen(request)).verdict).toBe('PASSED')
  })

  it('неверный ключ — не «недоступность», а наша ошибка', async () => {
    const aml = new MockAmlClient(70)
    aml.failWith(
      new AmlError({ code: AML_CODES.UNAUTHORIZED, message: 'ключ не принят', httpStatus: 401 }),
    )

    // Прятать это за «сервис не ответил» нельзя: зачисления встанут
    // по всей платформе, и никто не поймёт почему.
    await expect(aml.screen(request)).rejects.toThrow(AmlError)
  })

  it('что считать недоступностью', () => {
    expect(isUnavailable(new AmlError({ code: AML_CODES.NETWORK, message: '', httpStatus: 0 }))).toBe(true)
    expect(isUnavailable(new AmlError({ code: 'X', message: '', httpStatus: 503 }))).toBe(true)
    expect(
      isUnavailable(new AmlError({ code: AML_CODES.UNAUTHORIZED, message: '', httpStatus: 401 })),
    ).toBe(false)
    expect(
      isUnavailable(new AmlError({ code: AML_CODES.BAD_REQUEST, message: '', httpStatus: 400 })),
    ).toBe(false)
  })

  it('оценка для адреса распространяется на все его поступления', async () => {
    const aml = new MockAmlClient(70)
    aml.setRiskForAddress('TSender', 95)

    expect((await aml.screen(request)).verdict).toBe('FAILED')
    expect((await aml.screen({ ...request, chainTxId: 'tx-2' })).verdict).toBe('FAILED')
  })
})

/* ==========================================================================
   Режимы и отсутствие сети
   ========================================================================== */

describe('режимы', () => {
  it('по умолчанию обе заглушки, неизвестный режим — ошибка', () => {
    expect(createWalletClient({})).toBeDefined()
    expect(createAmlClient(70, {})).toBeDefined()

    expect(() => createWalletClient({ WALLET_MODE: 'prod' })).toThrow(WalletConfigError)
    expect(() => createAmlClient(70, { AML_MODE: 'prod' })).toThrow(AmlConfigError)

    // Боевой режим без ключа не поднимается молча.
    expect(() => createWalletClient({ WALLET_MODE: 'live' })).toThrow(WalletConfigError)
    expect(() => createAmlClient(70, { AML_MODE: 'live' })).toThrow(AmlConfigError)
  })

  it('заглушки не ходят в сеть', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')

    const wallet = createWalletClient({})
    const address = await wallet.createAddress(
      { network: 'tron', asset: 'USDT', reference: 'u' },
      { key: 'k' },
    )
    expect(address.address).toBeTruthy()

    await createAmlClient(70, {}).screen({
      chainTxId: 'tx',
      network: 'tron',
      asset: 'USDT',
      amountMinor: 1n,
      fromAddress: undefined,
    })

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

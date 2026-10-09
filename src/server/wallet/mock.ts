/**
 * Заглушка сервиса крипто-адресов.
 *
 * Реализует тот же интерфейс, что и боевой клиент, и потому
 * взаимозаменяема с ним. Разработка не должна зависеть от чужой
 * песочницы.
 *
 * **Главное требование: заглушка умеет ломаться.** Счастливый путь
 * подтверждает только то, что мы правильно поняли задачу; отказы
 * проверяют, что система переживёт реальность. Здесь воспроизводятся:
 * слишком частые запросы, оборванное соединение, неоднозначный ответ
 * на отправку возврата (деньги ушли, а мы об этом не узнали) и
 * недоступность сервиса.
 *
 * Отказы задаются сценарием, а не случайностью: тест, падающий раз
 * в сто прогонов, хуже отсутствующего.
 */

import { randomUUID } from 'node:crypto'
import type { Minor } from '@/shared/money'
import { CODES, WalletError } from './errors'
import type {
  IncomingPage,
  IncomingTransfer,
  Intent,
  Refund,
  WalletAddress,
  WalletAsset,
  WalletClient,
} from './types'

export type WalletOperation =
  | 'listAssets'
  | 'createAddress'
  | 'getIncoming'
  | 'listIncoming'
  | 'sendRefund'
  | 'getRefund'

interface ScheduledFailure {
  error: WalletError
  times: number
  /** Отказ наступает ПОСЛЕ того, как работа сделана. Так выглядит
   *  оборванное соединение на отправке: деньги ушли, ответ не дошёл. */
  afterWork: boolean
}

interface MockAddress extends WalletAddress {
  reference: string
  /** Уничтоженный адрес больше не используется никогда. */
  burned: boolean
}

const DEFAULT_ASSETS: WalletAsset[] = [
  { network: 'tron', asset: 'USDT', networkName: 'Tron (TRC-20)', iconUrl: undefined, requiresMemo: false },
  { network: 'ethereum', asset: 'USDT', networkName: 'Ethereum (ERC-20)', iconUrl: undefined, requiresMemo: false },
  { network: 'ton', asset: 'USDT', networkName: 'TON', iconUrl: undefined, requiresMemo: true },
]

export class MockWalletClient implements WalletClient {
  private readonly failures = new Map<WalletOperation, ScheduledFailure>()
  private readonly addresses = new Map<string, MockAddress>()
  private readonly incoming = new Map<string, IncomingTransfer>()
  private readonly refunds = new Map<string, Refund>()
  private readonly byIntent = new Map<string, string>()
  private assets = DEFAULT_ASSETS

  readonly calls: { op: WalletOperation; args: unknown[] }[] = []

  /* ---------------------------------------------------------------- */
  /* Сценарии                                                          */
  /* ---------------------------------------------------------------- */

  failNext(op: WalletOperation, error: WalletError, times = 1): void {
    this.failures.set(op, { error, times, afterWork: false })
  }

  /** «Слишком часто» — повторяется и замедляет очередь. */
  failRateLimited(op: WalletOperation, retryAfterSeconds = 1, times = 1): void {
    this.failNext(
      op,
      new WalletError({
        code: CODES.RATE_LIMITED,
        message: 'слишком часто',
        httpStatus: 429,
        retryAfterSeconds,
      }),
      times,
    )
  }

  /** Соединение оборвалось, не дойдя до сервиса. Работа не сделана. */
  failNetwork(op: WalletOperation, times = 1): void {
    this.failNext(
      op,
      new WalletError({ code: CODES.NETWORK, message: 'соединение оборвалось', httpStatus: 0 }),
      times,
    )
  }

  /** Сервис недоступен: нужен для проверки происхождения и для
   *  поведения системы, когда взять адрес неоткуда. */
  failUnavailable(op: WalletOperation, times = 1): void {
    this.failNext(
      op,
      new WalletError({ code: 'HTTP_503', message: 'сервис недоступен', httpStatus: 503 }),
      times,
    )
  }

  /**
   * Самый неприятный случай: **возврат ушёл, а ответ не дошёл.**
   *
   * Повторять нельзя — повтор отправит деньги второй раз. Состояние
   * выясняется чтением, и заглушка это позволяет: возврат в её
   * хранилище уже есть.
   */
  failAfterSendingRefund(times = 1): void {
    this.failures.set('sendRefund', {
      error: new WalletError({
        code: CODES.NETWORK,
        message: 'ответ не получен',
        httpStatus: 0,
      }),
      times,
      afterWork: true,
    })
  }

  setAssets(assets: WalletAsset[]): void {
    this.assets = assets
  }

  /**
   * Поступление на адрес.
   *
   * На уничтоженный адрес деньги прийти не могут: он выведен из
   * обращения, и пополнять по нему нельзя.
   */
  simulateIncoming(input: {
    addressId: string
    amountMinor: Minor
    fromAddress?: string
    confirmations?: number
  }): IncomingTransfer {
    const address = this.mustAddress(input.addressId)
    if (address.burned) {
      throw new WalletError({
        code: 'ADDRESS_BURNED',
        message: 'адрес уничтожен и больше не используется',
        httpStatus: 409,
      })
    }

    const transfer: IncomingTransfer = {
      chainTxId: `0x${randomUUID().replace(/-/g, '')}`,
      addressId: address.id,
      fromAddress: input.fromAddress,
      amountMinor: input.amountMinor,
      asset: address.asset,
      network: address.network,
      confirmations: input.confirmations ?? 0,
      txLink: undefined,
    }
    this.incoming.set(transfer.chainTxId, transfer)
    return transfer
  }

  /** Набежали подтверждения сети. */
  advanceConfirmations(chainTxId: string, to: number): IncomingTransfer {
    const transfer = this.incoming.get(chainTxId)
    if (!transfer) throw this.notFound('поступление', chainTxId)
    transfer.confirmations = to
    return { ...transfer }
  }

  addressState(addressId: string): MockAddress {
    return { ...this.mustAddress(addressId) }
  }

  /* ---------------------------------------------------------------- */
  /* Контракт                                                          */
  /* ---------------------------------------------------------------- */

  async listAssets(): Promise<WalletAsset[]> {
    this.enter('listAssets')
    return this.assets.map((asset) => ({ ...asset }))
  }

  async createAddress(
    input: { network: string; asset: string; reference: string },
    intent: Intent,
  ): Promise<WalletAddress> {
    this.enter('createAddress', input, intent)

    const seen = this.byIntent.get(intent.key)
    if (seen) return this.toAddress(this.mustAddress(seen))

    const id = `addr_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    const address: MockAddress = {
      id,
      network: input.network,
      asset: input.asset,
      address: `T${randomUUID().replace(/-/g, '').slice(0, 32)}`,
      memo: this.assets.find((a) => a.network === input.network)?.requiresMemo
        ? String(100000 + Math.floor(Math.random() * 899999))
        : undefined,
      reference: input.reference,
      burned: false,
    }
    this.addresses.set(id, address)
    this.byIntent.set(intent.key, id)
    return this.toAddress(address)
  }

  async getIncoming(chainTxId: string): Promise<IncomingTransfer> {
    this.enter('getIncoming', chainTxId)
    const transfer = this.incoming.get(chainTxId)
    if (!transfer) throw this.notFound('поступление', chainTxId)
    return { ...transfer }
  }

  async listIncoming(cursor: string | null): Promise<IncomingPage> {
    this.enter('listIncoming', cursor)
    const all = [...this.incoming.values()]
    const from = cursor === null ? 0 : Number(cursor)
    const items = all.slice(from, from + 100)
    return {
      items: items.map((item) => ({ ...item })),
      nextCursor: items.length === 0 ? null : String(from + items.length),
    }
  }

  async sendRefund(
    input: { chainTxId: string; toAddress: string },
    intent: Intent,
  ): Promise<Refund> {
    const existingId = this.byIntent.get(intent.key)
    if (existingId) {
      this.enter('sendRefund', input, intent)
      return { ...this.refunds.get(existingId)! }
    }

    const scheduled = this.failures.get('sendRefund')
    const failAfterWork = scheduled?.afterWork === true

    if (!failAfterWork) this.enter('sendRefund', input, intent)
    else this.calls.push({ op: 'sendRefund', args: [input, intent] })

    const transfer = this.incoming.get(input.chainTxId)
    if (!transfer) throw this.notFound('поступление', input.chainTxId)

    // Комиссию сети удерживает сервис. Нашей комиссии нет: денег мы
    // не получили, услуги не оказали.
    const networkFeeMinor = 100n
    const refund: Refund = {
      id: `rfnd_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      chainTxId: input.chainTxId,
      toAddress: input.toAddress,
      status: 'SENT',
      networkFeeMinor,
      sentMinor: transfer.amountMinor - networkFeeMinor,
    }
    this.refunds.set(refund.id, refund)
    this.byIntent.set(intent.key, refund.id)

    // Адрес выведен из обращения: после возврата он не используется
    // больше никогда.
    const address = this.addresses.get(transfer.addressId)
    if (address) address.burned = true

    if (failAfterWork && scheduled) {
      scheduled.times -= 1
      if (scheduled.times <= 0) this.failures.delete('sendRefund')
      // Деньги ушли, а ответа мы не получили. Повторять нельзя.
      throw scheduled.error
    }

    return { ...refund }
  }

  async getRefund(refundId: string): Promise<Refund> {
    this.enter('getRefund', refundId)
    const refund = this.refunds.get(refundId)
    if (!refund) throw this.notFound('возврат', refundId)
    return { ...refund }
  }

  /** Возвраты по поступлению — чем выясняют состояние после
   *  неоднозначного ответа. */
  findRefundByChainTx(chainTxId: string): Refund | undefined {
    for (const refund of this.refunds.values()) {
      if (refund.chainTxId === chainTxId) return { ...refund }
    }
    return undefined
  }

  /* ---------------------------------------------------------------- */

  private enter(op: WalletOperation, ...args: unknown[]): void {
    this.calls.push({ op, args })
    const scheduled = this.failures.get(op)
    if (!scheduled || scheduled.afterWork) return
    scheduled.times -= 1
    if (scheduled.times <= 0) this.failures.delete(op)
    throw scheduled.error
  }

  private mustAddress(id: string): MockAddress {
    const address = this.addresses.get(id)
    if (!address) throw this.notFound('адрес', id)
    return address
  }

  private toAddress(address: MockAddress): WalletAddress {
    return {
      id: address.id,
      network: address.network,
      asset: address.asset,
      address: address.address,
      memo: address.memo,
    }
  }

  private notFound(what: string, id: string): WalletError {
    return new WalletError({
      code: 'NOT_FOUND',
      message: `${what} ${id} не найден`,
      httpStatus: 404,
    })
  }
}

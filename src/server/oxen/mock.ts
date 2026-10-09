/**
 * Заглушка эмитента.
 *
 * Режим разработки до получения доступа к их API. Реализует тот же
 * интерфейс, что и боевой клиент, и потому взаимозаменяема с ним.
 *
 * **Главное требование: заглушка умеет ломаться.** Счастливый путь
 * проверяет только то, что мы правильно прочитали документацию;
 * ошибки проверяют то, что система переживёт реальность. Поэтому
 * воспроизводятся: задержка одобрения картхолдера, `429` с просьбой
 * подождать, `401` от общего троттлинга, `502 PROVIDER_AMBIGUOUS`,
 * отказ по залогу компании, перерасход по карте и потеря вебхука.
 *
 * Отказы задаются сценарием, а не случайностью: тест, падающий раз
 * в сто прогонов, хуже отсутствующего.
 */

import { randomUUID } from 'node:crypto'
import type { Minor } from '@/shared/money'
import { OxenError, KNOWN_CODES } from './errors'
import type { OxenCardStatus } from './schemas'
import type {
  Intent,
  OxenCard,
  OxenCardholder,
  OxenClient,
  OxenEventItem,
  OxenEventPage,
  OxenClientInfo,
  OxenFunding,
  OxenSecrets,
  OxenTransaction,
} from './types'

/** Вызовы, которым можно назначить отказ. */
export type MockOperation =
  | 'getFunding'
  | 'getClient'
  | 'createCardholder'
  | 'getCardholder'
  | 'issueCard'
  | 'getCard'
  | 'setCardLimit'
  | 'freezeCard'
  | 'unfreezeCard'
  | 'cancelCard'
  | 'getTransaction'
  | 'listEvents'
  | 'createSecretsSession'

interface ScheduledFailure {
  error: OxenError
  /** Сколько раз подряд отказать. */
  times: number
}

interface MockCard {
  id: string
  cardholderId: string
  clientId: string
  status: OxenCardStatus
  last4: string
  limitMinor: Minor
  /** Счётчик потраченного. Не сбрасывается никогда — как у них. */
  spentMinor: Minor
}

interface MockCardholder {
  id: string
  clientId: string
  fullName: string
  /** Сколько ещё чтений вернут «на проверке». Так выглядит задержка KYB. */
  pendingReads: number
}

export class MockOxenClient implements OxenClient {
  private readonly failures = new Map<MockOperation, ScheduledFailure>()
  private readonly cardholders = new Map<string, MockCardholder>()
  private readonly cards = new Map<string, MockCard>()
  private readonly transactions = new Map<string, OxenTransaction>()
  /** По какой карте прошла транзакция. У них это поле в чтении есть,
   *  у нас здесь — отдельной таблицей, чтобы не выдумывать его имя. */
  private readonly transactionCard = new Map<string, string>()
  private readonly pools = new Map<string, Minor>()
  /** Выданные идемпотентные ключи: повтор с тем же ключом отдаёт
   *  прежний результат, а не создаёт второй ресурс. */
  private readonly byIdempotencyKey = new Map<string, string>()
  private events: OxenEventItem[] = []
  /** События, не доставленные вебхуком. Достаются только догоном. */
  private undelivered: OxenEventItem[] = []
  private nextWebhookLost = false

  /** Все вызовы по порядку — на них опираются контрактные тесты. */
  readonly calls: { op: MockOperation; args: unknown[] }[] = []

  /* ---------------------------------------------------------------- */
  /* Сценарии                                                          */
  /* ---------------------------------------------------------------- */

  /** Назначить отказ на ближайшие `times` вызовов операции. */
  failNext(op: MockOperation, error: OxenError, times = 1): void {
    this.failures.set(op, { error, times })
  }

  /** `429` с просьбой подождать — общий на платформу рейт-лимит. */
  failRateLimited(op: MockOperation, retryAfterSeconds = 1, times = 1): void {
    this.failNext(
      op,
      new OxenError({
        code: KNOWN_CODES.PROVIDER_RATE_LIMITED,
        message: 'общий бюджет запросов исчерпан',
        httpStatus: 429,
        requestId: `req_${randomUUID()}`,
        retryAfterSeconds,
      }),
      times,
    )
  }

  /** `401` — ключ не принят ЛИБО сработал троттлинг. Различить нельзя. */
  failUnauthorized(op: MockOperation, times = 1): void {
    this.failNext(
      op,
      new OxenError({
        code: KNOWN_CODES.UNAUTHORIZED,
        message: 'ключ не принят либо общий троттлинг',
        httpStatus: 401,
        requestId: `req_${randomUUID()}`,
      }),
      times,
    )
  }

  /** `502 PROVIDER_AMBIGUOUS` — применилось или нет, эмитент не знает. */
  failAmbiguous(op: MockOperation, times = 1): void {
    this.failNext(
      op,
      new OxenError({
        code: KNOWN_CODES.PROVIDER_AMBIGUOUS,
        message: 'провайдер не подтвердил применение',
        httpStatus: 502,
        requestId: `req_${randomUUID()}`,
      }),
      times,
    )
  }

  /** `502 CARD_UNRECORDED` — карта, возможно, выпущена, но не записана.
   *  Повтор выпустит вторую: повторять нельзя никогда. */
  failCardUnrecorded(times = 1): void {
    this.failNext(
      'issueCard',
      new OxenError({
        code: KNOWN_CODES.CARD_UNRECORDED,
        message: 'карта могла быть выпущена, но не записана',
        httpStatus: 502,
        requestId: `req_${randomUUID()}`,
      }),
      times,
    )
  }

  /** Задержка одобрения: столько чтений картхолдера вернут «на проверке». */
  setKybDelay(cardholderId: string, reads: number): void {
    const holder = this.cardholders.get(cardholderId)
    if (holder) holder.pendingReads = reads
  }

  /** Залог компании. Проверяется РАНЬШЕ лимита карты. */
  setPool(clientId: string, availableMinor: Minor): void {
    this.pools.set(clientId, availableMinor)
  }

  /**
   * Трата по карте.
   *
   * Проверка идёт в том же порядке, что у них: сперва залог компании,
   * потом потолок карты. Поэтому отказ по залогу ничего не говорит об
   * остатке карты — и наши тексты для пользователя это учитывают.
   */
  simulateSpend(cardId: string, amountMinor: Minor): { approved: boolean; declineReason?: string } {
    const card = this.mustCard(cardId)
    if (card.status !== 'ACTIVE') {
      return { approved: false, declineReason: 'card_not_active' }
    }
    if (amountMinor > this.poolOf(card.clientId)) {
      return { approved: false, declineReason: KNOWN_CODES.ACCOUNT_CREDIT_LIMIT_EXCEEDED }
    }
    if (card.spentMinor + amountMinor > card.limitMinor) {
      return { approved: false, declineReason: 'card_limit_exceeded' }
    }
    card.spentMinor += amountMinor
    this.pools.set(card.clientId, this.poolOf(card.clientId) - amountMinor)
    return { approved: true }
  }

  /**
   * Авторизация по карте.
   *
   * Ставит резерв и шлёт `transaction.created`. Исходные суммы живут
   * только в этом событии: чтение транзакции затрёт их фактически
   * списанными.
   */
  simulateAuthorization(
    cardId: string,
    input: { amountMinor: Minor; localAmount?: Minor; localCurrency?: string; merchantName?: string },
  ): OxenTransaction {
    const card = this.mustCard(cardId)
    card.spentMinor += input.amountMinor

    const tx: OxenTransaction = {
      id: randomUUID(),
      type: 'AUTHORIZATION',
      status: 'AUTHORIZED',
      amountMinor: input.amountMinor,
      currency: 'USD',
      localAmountMinor: input.localAmount,
      localCurrency: input.localCurrency,
      authorizedAmountMinor: input.amountMinor,
      declineReason: undefined,
    }
    this.transactions.set(tx.id, tx)
    this.transactionCard.set(tx.id, card.id)
    this.pushEvent('transaction.created', {
      id: tx.id,
      cardId: card.id,
      amount: input.amountMinor,
      currency: 'USD',
      localAmount: input.localAmount,
      localCurrency: input.localCurrency,
      merchantName: input.merchantName,
    })
    return { ...tx }
  }

  /**
   * Списание осело.
   *
   * Чтение транзакции после этого отдаёт фактическую сумму и в поле
   * авторизации тоже: исходную взять уже неоткуда. Именно поэтому её
   * надо сохранять из события.
   */
  simulateSettlement(transactionId: string, settledMinor: Minor): OxenTransaction {
    const tx = this.transactions.get(transactionId)
    if (!tx) throw this.notFound('транзакция', transactionId)

    // Резерв снимается по сумме, которой он ставился, а осевшая сумма
    // добавляется: разница между ними — курс, чаевые или доплата.
    const cardId = this.transactionCard.get(tx.id)
    const card = cardId ? this.cards.get(cardId) : undefined
    if (card && tx.authorizedAmountMinor !== undefined) {
      card.spentMinor += settledMinor - tx.authorizedAmountMinor
    }

    tx.type = 'SPEND'
    tx.status = 'SETTLED'
    tx.amountMinor = settledMinor
    // Затирание — не ошибка заглушки, а воспроизведение их поведения.
    tx.authorizedAmountMinor = settledMinor

    this.pushEvent('transaction.updated', { id: tx.id, amount: settledMinor })
    return { ...tx }
  }

  /** Возврат от мерчанта. Приходит по курсу возврата, а не покупки. */
  simulateRefund(
    cardId: string,
    input: { receivedMinor: Minor; localAmount?: Minor; localCurrency?: string },
  ): OxenTransaction {
    const card = this.mustCard(cardId)
    card.spentMinor -= input.receivedMinor

    const tx: OxenTransaction = {
      id: randomUUID(),
      type: 'REFUND',
      status: 'SETTLED',
      amountMinor: input.receivedMinor,
      currency: 'USD',
      localAmountMinor: input.localAmount,
      localCurrency: input.localCurrency,
      authorizedAmountMinor: undefined,
      declineReason: undefined,
    }
    this.transactions.set(tx.id, tx)
    this.transactionCard.set(tx.id, card.id)
    this.pushEvent('transaction.created', {
      id: tx.id,
      cardId: card.id,
      amount: input.receivedMinor,
      currency: 'USD',
      localAmount: input.localAmount,
      localCurrency: input.localCurrency,
    })
    return { ...tx }
  }

  /**
   * Перерасход: списание пришло выше одобренного.
   *
   * Чаевые, поздний счёт, офлайн-операция, курсовая разница. Счётчик
   * потраченного уходит выше потолка, и это штатное поведение сети,
   * а не ошибка — система обязана его пережить.
   */
  simulateOverspend(cardId: string, authorizedMinor: Minor, settledMinor: Minor): OxenTransaction {
    const tx = this.simulateAuthorization(cardId, { amountMinor: authorizedMinor })
    return this.simulateSettlement(tx.id, settledMinor)
  }

  /**
   * Следующее событие вебхуком не придёт.
   *
   * Доставка у них одноразовая и без повторов: если наш эндпоинт
   * лежал, событие потеряно навсегда — кроме как через догон. Этим
   * переключателем такой простой и воспроизводится.
   */
  dropNextWebhook(): void {
    this.nextWebhookLost = true
  }

  /** Событие в поток. Доступно и вебхуком, и догоном. */
  pushEvent(type: string, data: unknown): OxenEventItem {
    if (this.nextWebhookLost) {
      this.nextWebhookLost = false
      return this.pushUndeliveredEvent(type, data)
    }
    const event: OxenEventItem = { id: `evt_${randomUUID()}`, type, data }
    this.events.push(event)
    return event
  }

  /**
   * Потерянный вебхук.
   *
   * Доставка у них **одноразовая, без ретраев**: если наш эндпоинт
   * лежал, событие потеряно навсегда — кроме как через догон. Поэтому
   * событие кладётся только в ленту догона.
   */
  pushUndeliveredEvent(type: string, data: unknown): OxenEventItem {
    const event: OxenEventItem = { id: `evt_${randomUUID()}`, type, data }
    this.undelivered.push(event)
    this.events.push(event)
    return event
  }

  /** События, которые вебхук доставил бы. */
  deliveredEvents(): OxenEventItem[] {
    const lost = new Set(this.undelivered.map((event) => event.id))
    return this.events.filter((event) => !lost.has(event.id))
  }

  cardState(cardId: string): MockCard {
    return { ...this.mustCard(cardId) }
  }

  /* ---------------------------------------------------------------- */
  /* Реализация контракта                                              */
  /* ---------------------------------------------------------------- */

  async getFunding(clientId: string): Promise<OxenFunding> {
    this.enter('getFunding', clientId)
    return { availableMinor: this.poolOf(clientId) }
  }

  /**
   * Компания целиком.
   *
   * Депозитный адрес собран из идентификатора компании: заглушка
   * обязана отдавать РАЗНЫЕ адреса разным компаниям — одинаковый
   * адрес скрыл бы ровно ту ошибку, из-за которой это поле вообще
   * читается (пул, ушедший на чужой кошелёк).
   */
  async getClient(clientId: string): Promise<OxenClientInfo> {
    this.enter('getClient', clientId)
    return { id: clientId, depositAddress: `TMock${clientId.replace(/[^a-z0-9]/gi, '')}Pool` }
  }

  async createCardholder(
    clientId: string,
    input: { fullName: string; email?: string },
    intent: Intent,
  ): Promise<OxenCardholder> {
    this.enter('createCardholder', clientId, input, intent)

    const seen = this.byIdempotencyKey.get(intent.key)
    if (seen) return this.readCardholder(seen, false)

    const id = `chd_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    this.cardholders.set(id, {
      id,
      clientId,
      fullName: input.fullName,
      // По умолчанию одобрение мгновенное; задержка KYB включается
      // сценарием, потому что она и есть неприятный случай.
      pendingReads: 0,
    })
    this.byIdempotencyKey.set(intent.key, id)
    return this.readCardholder(id, false)
  }

  async getCardholder(cardholderId: string): Promise<OxenCardholder> {
    this.enter('getCardholder', cardholderId)
    return this.readCardholder(cardholderId, true)
  }

  async issueCard(
    cardholderId: string,
    input: { limitMinor: Minor },
    intent: Intent,
  ): Promise<OxenCard> {
    this.enter('issueCard', cardholderId, input, intent)

    const seen = this.byIdempotencyKey.get(intent.key)
    if (seen) return this.toCard(this.mustCard(seen))

    const holder = this.cardholders.get(cardholderId)
    if (!holder) throw this.notFound('картхолдер', cardholderId)
    if (holder.pendingReads > 0) {
      // Карта картхолдеру «на проверке» не выпускается.
      throw new OxenError({
        code: 'CARDHOLDER_NOT_APPROVED',
        message: 'картхолдер ещё не одобрен',
        httpStatus: 409,
        requestId: `req_${randomUUID()}`,
      })
    }

    const id = `card_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    const card: MockCard = {
      id,
      cardholderId,
      clientId: holder.clientId,
      status: 'ACTIVE',
      last4: String(1000 + Math.floor(Math.random() * 8999)),
      limitMinor: input.limitMinor,
      spentMinor: 0n,
    }
    this.cards.set(id, card)
    this.byIdempotencyKey.set(intent.key, id)
    this.pushEvent('card.updated', { id, status: 'active' })
    return this.toCard(card)
  }

  async getCard(cardId: string): Promise<OxenCard> {
    this.enter('getCard', cardId)
    return this.toCard(this.mustCard(cardId))
  }

  async setCardLimit(cardId: string, limitMinor: Minor): Promise<OxenCard> {
    this.enter('setCardLimit', cardId, limitMinor)
    const card = this.mustCard(cardId)
    this.assertNotTerminal(card)
    // Абсолютное значение. Счётчик потраченного при этом НЕ трогается —
    // в этом вся суть накопительного лимита.
    card.limitMinor = limitMinor
    return this.toCard(card)
  }

  async freezeCard(cardId: string): Promise<OxenCard> {
    this.enter('freezeCard', cardId)
    const card = this.mustCard(cardId)
    this.assertNotTerminal(card)
    card.status = 'FROZEN'
    this.pushEvent('card.updated', { id: card.id, status: 'locked' })
    return this.toCard(card)
  }

  async unfreezeCard(cardId: string): Promise<OxenCard> {
    this.enter('unfreezeCard', cardId)
    const card = this.mustCard(cardId)
    this.assertNotTerminal(card)
    card.status = 'ACTIVE'
    this.pushEvent('card.updated', { id: card.id, status: 'active' })
    return this.toCard(card)
  }

  async cancelCard(cardId: string): Promise<OxenCard> {
    this.enter('cancelCard', cardId)
    const card = this.mustCard(cardId)
    this.assertNotTerminal(card)
    card.status = 'CANCELED'
    this.pushEvent('card.updated', { id: card.id, status: 'canceled' })
    return this.toCard(card)
  }

  async getTransaction(transactionId: string): Promise<OxenTransaction> {
    this.enter('getTransaction', transactionId)
    const tx = this.transactions.get(transactionId)
    if (!tx) throw this.notFound('транзакция', transactionId)
    return { ...tx }
  }

  async listEvents(cursor: string | null): Promise<OxenEventPage> {
    this.enter('listEvents', cursor)
    const from = cursor === null ? 0 : Number(cursor)
    const items = this.events.slice(from, from + 100)
    // Непустой курсор означает «запросить ещё раз», а не «есть ещё
    // события»: признак того, что догнали, — пустая страница
    // с курсором `null`.
    const nextCursor = items.length === 0 ? null : String(from + items.length)
    return { items: items.map((item) => ({ ...item })), nextCursor }
  }

  async createSecretsSession(cardId: string, sessionId: string): Promise<OxenSecrets> {
    this.enter('createSecretsSession', cardId, sessionId)
    this.mustCard(cardId)
    // Шифротекст непрозрачен и для них, и для нас: расшифровка идёт
    // на устройстве пользователя.
    return {
      encryptedPan: `enc:${sessionId}:pan`,
      encryptedCvc: `enc:${sessionId}:cvc`,
    }
  }

  /* ---------------------------------------------------------------- */

  private enter(op: MockOperation, ...args: unknown[]): void {
    this.calls.push({ op, args })
    const scheduled = this.failures.get(op)
    if (!scheduled) return
    scheduled.times -= 1
    if (scheduled.times <= 0) this.failures.delete(op)
    throw scheduled.error
  }

  private readCardholder(id: string, consumeDelay: boolean): OxenCardholder {
    const holder = this.cardholders.get(id)
    if (!holder) throw this.notFound('картхолдер', id)
    const pending = holder.pendingReads > 0
    if (pending && consumeDelay) holder.pendingReads -= 1
    const status = pending ? 'PENDING' : 'APPROVED'
    return { id: holder.id, status, approved: status === 'APPROVED' }
  }

  private mustCard(cardId: string): MockCard {
    const card = this.cards.get(cardId)
    if (!card) throw this.notFound('карта', cardId)
    return card
  }

  private assertNotTerminal(card: MockCard): void {
    if (card.status === 'CANCELED') {
      throw new OxenError({
        code: KNOWN_CODES.CARD_TERMINAL,
        message: 'карта отменена, отмена необратима',
        httpStatus: 409,
        requestId: `req_${randomUUID()}`,
      })
    }
  }

  private poolOf(clientId: string): Minor {
    return this.pools.get(clientId) ?? 1_000_000_00n
  }

  private toCard(card: MockCard): OxenCard {
    return {
      id: card.id,
      status: card.status,
      last4: card.last4,
      limitMinor: card.limitMinor,
    }
  }

  private notFound(what: string, id: string): OxenError {
    return new OxenError({
      code: 'NOT_FOUND',
      message: `${what} ${id} не найден`,
      httpStatus: 404,
      requestId: `req_${randomUUID()}`,
    })
  }
}

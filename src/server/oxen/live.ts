/**
 * Боевая реализация адаптера: песочница и продакшн.
 *
 * Здесь только перевод между нашими понятиями и их эндпоинтами.
 * Никаких решений: повторы, троттлинг и разбор ошибок живут в
 * `http.ts`, а что именно мы вызываем — в `types.ts`.
 *
 * На живом API не проверялась: доступа к нему пока нет. Переключение
 * `mock` → `sandbox` — отдельный этап работ (этап 8), и расхождения
 * будут. Список мест, где документация молчит, — `UNVERIFIED`
 * в `schemas.ts`.
 */

import type { Minor } from '@/shared/money'
import type { OxenHttp } from './http'
import {
  cardSchema,
  cardholderSchema,
  clientSchema,
  eventPageSchema,
  fundingSchema,
  secretsSchema,
  transactionSchema,
} from './schemas'
import type {
  Intent,
  OxenCard,
  OxenCardholder,
  OxenClient,
  OxenClientInfo,
  OxenEventPage,
  OxenFunding,
  OxenSecrets,
  OxenTransaction,
} from './types'

/**
 * Какой статус картхолдера считать одобренным.
 *
 * Набор значений в документации не перечислен — см. `UNVERIFIED`.
 * Поэтому проверка нарочно узкая: одобрением считается только явное
 * `APPROVED`. Любое другое значение — «ещё не одобрен», и карта не
 * выпускается. Ошибиться в эту сторону безопасно: максимум задержим
 * выпуск. Ошибиться в другую — выпустить карту человеку, которого
 * эмитент не проверил.
 */
export function isCardholderApproved(status: string): boolean {
  return status.toUpperCase() === 'APPROVED'
}

export class LiveOxenClient implements OxenClient {
  constructor(private readonly http: OxenHttp) {}

  async getFunding(clientId: string): Promise<OxenFunding> {
    const data = await this.http.request({
      method: 'GET',
      path: `/clients/${clientId}/funding`,
      kind: 'READ',
    })
    const parsed = fundingSchema.parse(data)
    if (parsed.availableAmount === undefined) {
      // Лучше громко упасть, чем подставить ноль: ноль в инварианте
      // платёжеспособности означает «пул пуст» и остановит выпуск карт
      // по всей компании, а причина будет непонятна.
      throw new Error(
        'В ответе о залоге нет суммы доступного. Имя поля не подтверждено — см. UNVERIFIED в schemas.ts',
      )
    }
    return { availableMinor: parsed.availableAmount }
  }

  async getClient(clientId: string): Promise<OxenClientInfo> {
    const data = await this.http.request({
      method: 'GET',
      path: `/clients/${clientId}`,
      kind: 'READ',
    })
    const parsed = clientSchema.parse(data)
    // Адрес необязателен: если его нет, показывать нечего — но это
    // не повод ронять чтение пула, которое идёт рядом.
    return { id: parsed.id, depositAddress: parsed.depositAddress }
  }

  async createCardholder(
    clientId: string,
    input: { fullName: string; email?: string },
    intent: Intent,
  ): Promise<OxenCardholder> {
    const data = await this.http.request({
      method: 'POST',
      path: `/clients/${clientId}/cardholders`,
      kind: 'CREATE',
      idempotencyKey: intent.key,
      body: { fullName: input.fullName, email: input.email },
    })
    return toCardholder(data)
  }

  async getCardholder(cardholderId: string): Promise<OxenCardholder> {
    const data = await this.http.request({
      method: 'GET',
      path: `/cardholders/${cardholderId}`,
      kind: 'READ',
    })
    return toCardholder(data)
  }

  async issueCard(
    cardholderId: string,
    input: { limitMinor: Minor },
    intent: Intent,
  ): Promise<OxenCard> {
    const data = await this.http.request({
      method: 'POST',
      path: `/cardholders/${cardholderId}/cards`,
      kind: 'CREATE',
      idempotencyKey: intent.key,
      // `limit` обязателен: без него карта не выпускается вовсе.
      // `displayName` и `shipping` на виртуальной карте не отправляем —
      // первое ни на что не влияет, второе вызывает отказ.
      body: { limit: input.limitMinor },
    })
    return toCard(data)
  }

  async getCard(cardId: string): Promise<OxenCard> {
    const data = await this.http.request({
      method: 'GET',
      path: `/cards/${cardId}`,
      kind: 'READ',
    })
    return toCard(data)
  }

  async setCardLimit(cardId: string, limitMinor: Minor): Promise<OxenCard> {
    const data = await this.http.request({
      method: 'PUT',
      path: `/cards/${cardId}/limit`,
      kind: 'MUTATE',
      // АБСОЛЮТНОЕ значение потолка, не прибавка.
      body: { limit: limitMinor },
    })
    return toCard(data)
  }

  async freezeCard(cardId: string): Promise<OxenCard> {
    return toCard(
      await this.http.request({ method: 'POST', path: `/cards/${cardId}/freeze`, kind: 'MUTATE' }),
    )
  }

  async unfreezeCard(cardId: string): Promise<OxenCard> {
    return toCard(
      await this.http.request({ method: 'POST', path: `/cards/${cardId}/unfreeze`, kind: 'MUTATE' }),
    )
  }

  async cancelCard(cardId: string): Promise<OxenCard> {
    return toCard(
      await this.http.request({ method: 'POST', path: `/cards/${cardId}/cancel`, kind: 'MUTATE' }),
    )
  }

  async getTransaction(transactionId: string): Promise<OxenTransaction> {
    const data = await this.http.request({
      method: 'GET',
      path: `/transactions/${transactionId}`,
      kind: 'READ',
    })
    const parsed = transactionSchema.parse(data)
    return {
      id: parsed.id,
      type: parsed.type,
      status: parsed.status,
      amountMinor: parsed.amount,
      currency: parsed.currency,
      localAmountMinor: parsed.localAmount,
      localCurrency: parsed.localCurrency,
      authorizedAmountMinor: parsed.authorizedAmount,
      declineReason: parsed.declineReason,
    }
  }

  async listEvents(cursor: string | null): Promise<OxenEventPage> {
    const data = await this.http.request({
      method: 'GET',
      path: '/events',
      kind: 'READ',
      query: { cursor: cursor ?? undefined },
    })
    const parsed = eventPageSchema.parse(data)
    return {
      items: parsed.items.map((item) => ({ id: item.id, type: item.type, data: item.data })),
      nextCursor: parsed.nextCursor ?? null,
    }
  }

  async createSecretsSession(cardId: string, sessionId: string): Promise<OxenSecrets> {
    const data = await this.http.request({
      method: 'POST',
      path: `/cards/${cardId}/secrets`,
      kind: 'MUTATE',
      body: { sessionId },
    })
    // Шифротекст проходит через нас непрозрачно: ключа для расшифровки
    // на сервере нет и быть не должно (docs/security.md).
    return secretsSchema.parse(data)
  }
}

function toCardholder(data: unknown): OxenCardholder {
  const parsed = cardholderSchema.parse(data)
  return { id: parsed.id, status: parsed.status, approved: isCardholderApproved(parsed.status) }
}

function toCard(data: unknown): OxenCard {
  const parsed = cardSchema.parse(data)
  return {
    id: parsed.id,
    status: parsed.status,
    last4: parsed.last4,
    limitMinor: parsed.limit,
  }
}

/**
 * Боевая реализация адаптера крипто-адресов.
 *
 * На живом API не проверялась: доступа пока нет. Маршруты и имена
 * полей — наше лучшее понимание задачи, и при подключении этот файл
 * будет выверен целиком по списку `UNVERIFIED` из `schemas.ts`.
 *
 * Решения здесь не принимаются: повторы, троттлинг и разбор ошибок
 * живут в `http.ts` и `errors.ts`, а что мы вообще вызываем — в
 * `types.ts`.
 */

import {
  addressSchema,
  assetSchema,
  incomingPageSchema,
  incomingSchema,
  refundSchema,
} from './schemas'
import type { WalletHttp } from './http'
import type {
  IncomingPage,
  IncomingTransfer,
  Intent,
  Refund,
  WalletAddress,
  WalletAsset,
  WalletClient,
} from './types'
import { z } from 'zod'

export class LiveWalletClient implements WalletClient {
  constructor(private readonly http: WalletHttp) {}

  async listAssets(): Promise<WalletAsset[]> {
    const data = await this.http.request({ method: 'GET', path: '/assets', kind: 'READ' })
    return z
      .array(assetSchema)
      .parse(data)
      .map((item) => ({
        network: item.network,
        asset: item.asset,
        networkName: item.networkName ?? item.network,
        iconUrl: item.iconUrl,
        requiresMemo: item.requiresMemo ?? false,
      }))
  }

  async createAddress(
    input: { network: string; asset: string; reference: string },
    intent: Intent,
  ): Promise<WalletAddress> {
    const data = await this.http.request({
      method: 'POST',
      path: '/addresses',
      kind: 'CREATE',
      idempotencyKey: intent.key,
      // `reference` — наш идентификатор пользователя у них. По нему и
      // по адресу мы знаем, чей пришёл платёж.
      body: { network: input.network, asset: input.asset, reference: input.reference },
    })
    return toAddress(data)
  }

  async getIncoming(chainTxId: string): Promise<IncomingTransfer> {
    const data = await this.http.request({
      method: 'GET',
      path: `/incoming/${chainTxId}`,
      kind: 'READ',
    })
    return toIncoming(data)
  }

  async listIncoming(cursor: string | null): Promise<IncomingPage> {
    const data = await this.http.request({
      method: 'GET',
      path: '/incoming',
      kind: 'READ',
      query: { cursor: cursor ?? undefined },
    })
    const parsed = incomingPageSchema.parse(data)
    return {
      items: parsed.items.map(fromIncomingShape),
      nextCursor: parsed.nextCursor ?? null,
    }
  }

  async sendRefund(
    input: { chainTxId: string; toAddress: string },
    intent: Intent,
  ): Promise<Refund> {
    const data = await this.http.request({
      method: 'POST',
      path: '/refunds',
      kind: 'CREATE',
      idempotencyKey: intent.key,
      // Получатель ровно один и выбран не нами: это адрес, с которого
      // пришли средства. Ни суммы, ни комиссии мы не задаём — сколько
      // лежит на адресе, столько и уходит за вычетом комиссии сети.
      body: { chainTxId: input.chainTxId, toAddress: input.toAddress },
    })
    return toRefund(data)
  }

  async getRefund(refundId: string): Promise<Refund> {
    const data = await this.http.request({
      method: 'GET',
      path: `/refunds/${refundId}`,
      kind: 'READ',
    })
    return toRefund(data)
  }
}

function toAddress(data: unknown): WalletAddress {
  const parsed = addressSchema.parse(data)
  return {
    id: parsed.id,
    network: parsed.network,
    asset: parsed.asset,
    address: parsed.address,
    memo: parsed.memo,
  }
}

function toIncoming(data: unknown): IncomingTransfer {
  return fromIncomingShape(incomingSchema.parse(data))
}

function fromIncomingShape(parsed: z.infer<typeof incomingSchema>): IncomingTransfer {
  return {
    chainTxId: parsed.chainTxId,
    addressId: parsed.addressId,
    fromAddress: parsed.fromAddress,
    amountMinor: parsed.amount,
    asset: parsed.asset,
    network: parsed.network,
    confirmations: parsed.confirmations,
    txLink: parsed.txLink,
  }
}

function toRefund(data: unknown): Refund {
  const parsed = refundSchema.parse(data)
  return {
    id: parsed.id,
    chainTxId: parsed.chainTxId,
    toAddress: parsed.toAddress,
    status: parsed.status,
    networkFeeMinor: parsed.networkFee,
    sentMinor: parsed.sentAmount,
  }
}

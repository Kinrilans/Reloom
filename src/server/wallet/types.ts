/**
 * Интерфейс адаптера сервиса крипто-адресов.
 *
 * Бизнес-логика видит только это. Ни HTTP, ни их полей, ни кодов
 * ошибок в сигнатурах нет: контракт у нас с этим файлом, а не с их
 * документацией.
 *
 * Операции ровно те, что нужны продукту: выдать адрес, узнать о
 * поступлении, отправить возврат. Собственных кошельков и собственной
 * работы с блокчейном у нас нет и не появится (CLAUDE.md).
 */

import type { Minor } from '@/shared/money'

/** Пара «монета + сеть». Неразрывна: перевод не той монетой теряется
 *  так же, как перевод не в той сети. */
export interface WalletAsset {
  /** Код сети у сервиса, например `tron`. */
  network: string
  /** Тикер монеты, например `USDT`. */
  asset: string
  /** Человекочитаемое название сети. */
  networkName: string
  /** Значок, если сервис его отдаёт. Иначе грузит оператор. */
  iconUrl: string | undefined
  /** Требует ли сеть memo/tag. */
  requiresMemo: boolean
}

export interface WalletAddress {
  /** Идентификатор адреса у сервиса. */
  id: string
  network: string
  asset: string
  address: string
  memo: string | undefined
}

/** Поступление, увиденное сервисом. */
export interface IncomingTransfer {
  /** Идентификатор транзакции в сети. Наш ключ идемпотентности. */
  chainTxId: string
  /** На какой адрес пришло — по нему известно, чей это платёж. */
  addressId: string
  /** Адрес отправителя: единственный возможный получатель возврата.
   *  Сохраняем при получении — задним числом не восстановить. */
  fromAddress: string | undefined
  amountMinor: Minor
  asset: string
  network: string
  /** Сколько подтверждений сети набрано. */
  confirmations: number
  txLink: string | undefined
}

export interface IncomingPage {
  items: IncomingTransfer[]
  nextCursor: string | null
}

export type RefundStatus = 'PENDING' | 'SENT' | 'FAILED'

export interface Refund {
  id: string
  chainTxId: string
  toAddress: string
  status: RefundStatus
  /** Комиссию сети удерживает сервис. Нашей комиссии тут нет: денег
   *  мы не получили, услуги не оказали. */
  networkFeeMinor: Minor | undefined
  /** Сколько реально ушло отправителю. */
  sentMinor: Minor | undefined
}

/** Намерение, записанное до отправки. */
export interface Intent {
  key: string
}

export interface WalletClient {
  /**
   * Список пар «монета + сеть».
   *
   * Открывать у себя сеть, в которой сервис не выдаёт адрес,
   * бессмысленно — пополнять по ней будет нечем.
   */
  listAssets(): Promise<WalletAsset[]>

  /**
   * Завести адрес под пару и под конкретного пользователя.
   *
   * Общего адреса «на всех» не бывает: по нему невозможно отличить,
   * чей пришёл платёж, а значит невозможно и зачислить без человека.
   */
  createAddress(
    input: { network: string; asset: string; reference: string },
    intent: Intent,
  ): Promise<WalletAddress>

  getIncoming(chainTxId: string): Promise<IncomingTransfer>
  listIncoming(cursor: string | null): Promise<IncomingPage>

  /**
   * Отправить возврат на адрес отправителя.
   *
   * Получатель ровно один и задаётся не нами: это адрес, с которого
   * пришли средства. Повторять этот вызов нельзя (см. `errors.ts`).
   */
  sendRefund(
    input: { chainTxId: string; toAddress: string },
    intent: Intent,
  ): Promise<Refund>

  getRefund(refundId: string): Promise<Refund>
}

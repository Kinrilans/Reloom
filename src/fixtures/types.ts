/**
 * Типы демо-данных клиентской части.
 *
 * ВСЕ денежные величины здесь — готовые СТРОКИ, посчитанные руками.
 * Это не экономия, а правило этапа (docs/prototype.md): в прототипе нет
 * ни одной строки, считающей баланс, остаток, комиссию или лимит. Числа,
 * посчитанные «на глаз, чтобы показать», переживают прототип, попадают
 * в продукт и всплывают на реальных деньгах. Расчёты появляются один раз,
 * на этапе 1, с тестами из docs/domain-and-money.md.
 *
 * Поэтому тип суммы — `string`, а не `number` и не `bigint`: так на уровне
 * типов невозможно случайно сложить две суммы.
 */

export type Money = string

export type CardStatus = 'ACTIVE' | 'FROZEN' | 'CLOSING' | 'CANCELED'

/** Причину заморозки обязательно хранить: разморозка после пополнения
 *  снимает только NEGATIVE_BALANCE, ручная заморозка сохраняется. */
export type FreezeReason = 'NEGATIVE_BALANCE' | 'BY_USER' | 'BY_OPERATOR' | 'CLOSING'

export type ProfileStatus = 'APPROVED' | 'PENDING' | 'STUCK' | 'BLOCKED'

export type OperationType = 'spend' | 'deposit' | 'withdrawal' | 'transfer' | 'refund'
export type OperationStatus = 'pending' | 'completed' | 'declined' | 'refund' | 'reversed'

export interface Operation {
  id: string
  type: OperationType
  status: OperationStatus
  /** Название мерчанта приходит от эмитента сырым и НЕ переводится никогда. */
  merchant?: string
  /** Для не-торговых операций подпись берётся кодом из словаря. */
  titleKey?: string
  cardId?: string
  cardLast4?: string
  /** Сумма со знаком, как показывается: «-49.99», «+500.00». */
  amount: Money
  currency: string
  /** Сумма и валюта мерчанта — только для показа, в расчётах не участвует. */
  localAmount?: Money
  localCurrency?: string
  /** Заблокировано при авторизации. Сохраняется из события, чтением затирается. */
  authorized?: Money
  /** Фактически списано при сеттлменте. Леджер ведётся по нему. */
  settled?: Money
  /** Почему холд и списание разошлись: курс или доплата мерчанта. */
  diffReason?: 'rate' | 'tips'
  /** Расчётный курс, ПОСЧИТАННЫЙ ЗАРАНЕЕ и записанный строкой.
   *  Официального курса в API нет, а делить списанное на сумму мерчанта
   *  прямо в прототипе нельзя — это арифметика над деньгами. */
  derivedRate?: string
  /** Для возврата: сколько стоила покупка. */
  refundPurchase?: Money
  refundPurchaseLocal?: Money
  /** Код причины отказа. В текст превращается словарём при показе. */
  declineReasonCode?: string
  occurredAt: string
  settledAt?: string
}

export interface Card {
  id: string
  last4: string
  isPrimary: boolean
  status: CardStatus
  freezeReason?: FreezeReason
  expires: string
  /** Потолок минус потраченное. Здесь — готовое число из фикстуры. */
  available: Money
  spent: Money
  currency: string
  /** Удерживается по незакрытым авторизациям при закрытии карты. */
  held?: Money
  heldOperations?: Operation[]
  /** Незавершённый перевод: второй вызов ещё не подтверждён. */
  transferPending?: boolean
}

export interface Network {
  id: string
  name: string
  asset: string
  address: string
  memo?: string
  memoLabel?: string
}

export interface DepositRequest {
  id: string
  status: 'SUBMITTED' | 'CREDITED' | 'REJECTED'
  amount: Money
  currency: string
  networkId: string
  txLink?: string
  rejectReason?: string
  createdAt: string
}

export interface Scenario {
  id: string
  /** Подпись сценария для каталога состояний. */
  label: string
  name: string
  profileStatus: ProfileStatus
  /** Карантин после привязки нового Telegram: блокирует часть действий. */
  quarantineUntil?: string
  balance: Money
  currency: string
  /** Показывается, только когда меньше баланса. */
  spendable?: Money
  /** Что ограничивает трату. «pool» показывается как технические работы:
   *  состояние пула — наша кухня, пользователя она не касается. */
  spendableLimitedBy?: 'pool'
  /** Сколько не хватает при отрицательном балансе. */
  shortfall?: Money
  /** Нераспределённый остаток: в норме ноль. */
  unallocated?: Money
  cards: Card[]
  operations: Operation[]
  deposit?: DepositRequest
  /** Эмитент недоступен: показываем последние известные данные с отметкой. */
  offlineSince?: string
}

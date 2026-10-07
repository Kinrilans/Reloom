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

export interface Asset {
  /** Тикер: USDT, USDC. Он же идентификатор — тикер у монеты один. */
  id: string
  /** Полное название: «Tether». Стоит рядом с тикером, как в кошельках:
   *  по тикеру монету узнают, по названию — проверяют, что не перепутали. */
  name: string
  /** Значок. Загружает оператор в админке; пока файла нет — заглушка. */
  iconUrl: string | null
}

export interface Network {
  id: string
  name: string
  asset: string
  /** Значок монеты. Загружает оператор в админке; пока файла нет —
   *  на его месте нейтральная заглушка того же размера. */
  iconUrl: string | null
  address: string
  memo?: string
  memoLabel?: string
}

/** Чем уведомление является для человека: от этого зависит значок и то,
 *  можно ли его отключить (docs/flows-user.md). */
export type NotificationKind = 'challenge' | 'security' | 'money' | 'card'

export interface AppNotification {
  id: string
  /** Код события, не готовый текст: при смене языка лента перечитывается
   *  на новом языке (CLAUDE.md, правило 3e). */
  code: string
  /** Подстановки в шаблон. Имя мерчанта среди них — и оно не переводится. */
  params?: Record<string, string>
  kind: NotificationKind
  /** Код причины отказа: в текст превращается своим словарём. */
  reasonCode?: string
  /** 3DS-код. Показывается отдельной строкой, крупно: его переписывают
   *  в чужое окно оплаты, и искать его в абзаце некогда. */
  challengeCode?: string
  /** Код действия, которое предлагает уведомление. Не ссылка и не текст:
   *  куда ведёт `refund`, решает экран, а не запись в ленте. */
  actionCode?: 'refund'
  at: string
  unread?: boolean
}

/**
 * Поступление, которое система видит прямо сейчас.
 *
 * `confirming` — транзакция в сети, ждём подтверждений.
 * `checking` — подтверждений хватает, идёт проверка происхождения.
 * `credited` — зачислено. `rejected` — проверка не пройдена, деньги
 * не зачислены и ждут возврата отправителю.
 */
export type IncomingStatus = 'confirming' | 'checking' | 'credited' | 'rejected'

export interface IncomingDeposit {
  id: string
  status: IncomingStatus
  amount: Money
  asset: string
  network: string
  /** Подтверждений сети: сколько есть и сколько нужно. Строки, не числа:
   *  считать здесь нечего, оба значения приходят готовыми. */
  confirmations: string
  confirmationsNeeded: string
  /** Адрес отправителя — он же единственный адрес возврата. */
  from: string
  txLink: string
  startedAt: string
  /** Удержание и сумма к зачислению. Посчитаны заранее. */
  fee: Money
  net: Money
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
  /** Поступления, которые система видит прямо сейчас. Пока список не
   *  пуст, на главной висит кнопка «Активные транзакции». */
  incoming?: IncomingDeposit[]
  /** Эмитент недоступен: показываем последние известные данные с отметкой. */
  offlineSince?: string
}

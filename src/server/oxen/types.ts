/**
 * Интерфейс адаптера эмитента.
 *
 * Это единственное, что видит бизнес-логика. Ни HTTP, ни заголовков,
 * ни конвертов, ни кодов ошибок в сигнатурах нет: когда их контракт
 * в очередной раз поменяется, меняться будет реализация, а не
 * вызывающий код.
 *
 * Операции ровно те, что мы используем (`docs/oxen-integration.md`).
 * Выводов, контрагентов, физических карт, диспутов и PIN здесь нет
 * и быть не должно — не потому, что «потом добавим», а потому, что мы
 * ими не пользуемся.
 */

import type { Minor } from '@/shared/money'
import type { OxenCardStatus } from './schemas'

export interface OxenCardholder {
  id: string
  status: string
  /** Одобрен ли у эмитента. До одобрения карты выпускать нельзя. */
  approved: boolean
}

export interface OxenCard {
  id: string
  status: OxenCardStatus
  last4: string | undefined
  /** Подтверждённый эмитентом абсолютный потолок. */
  limitMinor: Minor | undefined
}

export interface OxenTransaction {
  id: string
  /** Вид операции у эмитента, если он его отдаёт. Имя и значения не
   *  подтверждены: обработчик события умеет работать и без них. */
  type: string | undefined
  /** Состояние операции у эмитента, если он его отдаёт. */
  status: string | undefined
  /** Списано, в валюте расчёта (USD). Леджер ведётся по ней. */
  amountMinor: Minor
  currency: string
  /** Запрошено мерчантом, в его валюте. Только для показа. */
  localAmountMinor: Minor | undefined
  localCurrency: string | undefined
  /** ВНИМАНИЕ: при чтении это поле уже затёрто фактически списанной
   *  суммой. Исходную авторизацию берём из события, не отсюда. */
  authorizedAmountMinor: Minor | undefined
  declineReason: string | undefined
}

export interface OxenEventItem {
  id: string
  type: string
  data: unknown
}

export interface OxenEventPage {
  items: OxenEventItem[]
  /** Непустой курсор означает «запросить ещё раз», а не «есть ещё
   *  события». Признак того, что догнали, — пустая страница
   *  с курсором `null`. */
  nextCursor: string | null
}

/**
 * Компания у эмитента.
 *
 * Читается ради депозитного адреса пула: ввести его руками нельзя —
 * введённый руками означает пул, ушедший на чужой кошелёк.
 */
export interface OxenClientInfo {
  id: string
  depositAddress: string | undefined
}

export interface OxenFunding {
  /** Доступный залог компании. Нужен инварианту платёжеспособности. */
  availableMinor: Minor
}

export interface OxenSecrets {
  encryptedPan: string
  encryptedCvc: string
}

/**
 * Намерение, записанное до отправки создающего запроса.
 *
 * Идемпотентный ключ генерируем мы и сохраняем в базе ДО вызова.
 * Иначе процесс, упавший между отправкой и ответом, не оставит следа,
 * и мы не узнаем, был ли выпущен картхолдер или карта.
 */
export interface Intent {
  /** Наш ключ. Он же уходит в заголовок `Idempotency-Key`. */
  key: string
}

export interface OxenClient {
  /** Компания: пул и spending power. */
  getFunding(clientId: string): Promise<OxenFunding>
  /** Компания целиком. Нужна ради депозитного адреса пула. */
  getClient(clientId: string): Promise<OxenClientInfo>

  createCardholder(
    clientId: string,
    input: { fullName: string; email?: string },
    intent: Intent,
  ): Promise<OxenCardholder>
  getCardholder(cardholderId: string): Promise<OxenCardholder>

  /** `limit` обязателен при выпуске: без него карта не выпускается. */
  issueCard(
    cardholderId: string,
    input: { limitMinor: Minor },
    intent: Intent,
  ): Promise<OxenCard>
  getCard(cardId: string): Promise<OxenCard>

  /** АБСОЛЮТНОЕ значение потолка, не прибавка. */
  setCardLimit(cardId: string, limitMinor: Minor): Promise<OxenCard>
  freezeCard(cardId: string): Promise<OxenCard>
  unfreezeCard(cardId: string): Promise<OxenCard>
  /** Необратимо. */
  cancelCard(cardId: string): Promise<OxenCard>

  getTransaction(transactionId: string): Promise<OxenTransaction>

  /** Догон событий по курсору. Крутится фоновым процессом постоянно. */
  listEvents(cursor: string | null): Promise<OxenEventPage>

  /** Реквизиты. Сервер только проксирует шифротекст: открытых данных
   *  он не видит и видеть не должен (`docs/security.md`). */
  createSecretsSession(cardId: string, sessionId: string): Promise<OxenSecrets>
}

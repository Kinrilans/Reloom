/**
 * Zod-схемы ответов эмитента.
 *
 * Всё, что приходит снаружи, проходит через схему до использования
 * (CLAUDE.md, «Конвенции»). Схема здесь — не формальность: их контракт
 * менялся ломающими изменениями четыре раза за месяц уже ПОСЛЕ того,
 * как был объявлен финализированным. Падение на разборе ответа — это
 * заметная ошибка; молча прочитанное `undefined` вместо суммы — нет.
 *
 * Два принципа.
 *
 * 1. **Лишние поля пропускаются.** Новое поле в их ответе не должно
 *    ронять нам обработку: мы читаем только то, что нам нужно.
 * 2. **Требуется только задокументированное.** Поле, названия которого
 *    в документации нет, обязательным не делается: угаданное имя
 *    упадёт на песочнице в самый неудобный момент.
 *
 * Список непроверенных мест собран в `UNVERIFIED` внизу файла — это
 * чек-лист на этап 8 (переключение на sandbox).
 */

import { z } from 'zod'

/* --------------------------------------------------------------------------
   Конверт
   -------------------------------------------------------------------------- */

/**
 * Ответы завёрнуты в конверт, в `_metadata` лежит `requestId` — то,
 * с чем обращаются в их поддержку. Логируется всегда.
 */
export const envelopeSchema = z.object({
  data: z.unknown(),
  _metadata: z
    .object({ requestId: z.string().optional() })
    .loose()
    .optional(),
})

export const errorBodySchema = z.object({
  error: z
    .object({
      code: z.string(),
      message: z.string().optional(),
      params: z.unknown().optional(),
    })
    .loose(),
})

/* --------------------------------------------------------------------------
   Идентификаторы

   Префиксы задокументированы, и проверка по ним ловит самую обидную
   ошибку интеграции — перепутанные местами идентификаторы.
   `transaction.id` единственный идёт БЕЗ префикса: префикса `txn_`
   не существует, хотя он был в черновике контракта.
   -------------------------------------------------------------------------- */

const prefixed = (prefix: string) =>
  z.string().refine((value) => value.startsWith(`${prefix}_`), {
    message: `идентификатор должен начинаться с «${prefix}_»`,
  })

export const clientIdSchema = prefixed('cl')
export const cardholderIdSchema = prefixed('chd')
export const cardIdSchema = prefixed('card')
export const eventIdSchema = prefixed('evt')
export const transactionIdSchema = z.string().min(1)

/* --------------------------------------------------------------------------
   Ресурсы
   -------------------------------------------------------------------------- */

/**
 * Статус карты в ЧТЕНИИ — в верхнем регистре.
 *
 * В событиях тот же статус приходит в вокабуляре эмитента, в нижнем
 * регистре, и `locked` там соответствует `FROZEN` здесь. Сравнивать
 * значения события с этим перечислением нельзя — для этого есть
 * `cardStatusFromEvent`.
 */
export const cardStatusSchema = z.enum(['ACTIVE', 'FROZEN', 'CANCELED'])
export type OxenCardStatus = z.infer<typeof cardStatusSchema>

/** Вокабуляр событий. Отдельный нарочно. */
const EVENT_CARD_STATUS: Record<string, OxenCardStatus> = {
  active: 'ACTIVE',
  locked: 'FROZEN',
  canceled: 'CANCELED',
}

/**
 * Статус из события в наш. Неизвестное значение — не повод угадывать:
 * возвращаем `null`, и вызывающий перечитывает карту.
 */
export function cardStatusFromEvent(value: string): OxenCardStatus | null {
  return EVENT_CARD_STATUS[value] ?? null
}

export const cardholderSchema = z
  .object({
    id: cardholderIdSchema,
    // Статус KYB. Набор значений в документации не перечислен, поэтому
    // строка: интерпретация — в `isCardholderApproved`.
    status: z.string(),
  })
  .loose()

export const cardSchema = z
  .object({
    id: cardIdSchema,
    status: cardStatusSchema,
    last4: z.string().optional(),
    // Абсолютный потолок, подтверждённый эмитентом.
    limit: z.coerce.bigint().optional(),
  })
  .loose()

export const transactionSchema = z
  .object({
    id: transactionIdSchema,
    // Имена и значения этих двух полей в документации не названы —
    // см. UNVERIFIED. Поэтому они необязательны, а обработчик события
    // умеет работать и без них, опираясь на тип события.
    type: z.string().optional(),
    status: z.string().optional(),
    amount: z.coerce.bigint(),
    currency: z.string(),
    localAmount: z.coerce.bigint().optional(),
    localCurrency: z.string().optional(),
    // Чтение ЗАТИРАЕТ это поле фактически списанной суммой. Исходную
    // сумму авторизации сохраняем из события и отсюда не берём.
    authorizedAmount: z.coerce.bigint().optional(),
    declineReason: z.string().optional(),
  })
  .loose()

/**
 * Компания у эмитента.
 *
 * Нужна ровно за одним — депозитный адрес пула. Он выдаётся эмитентом
 * после заведения компании, и ввести его руками нельзя: введённый
 * руками означает пул, ушедший на чужой кошелёк.
 *
 * Имя поля с адресом не задокументировано — см. UNVERIFIED.
 */
export const clientSchema = z
  .object({
    id: clientIdSchema,
    depositAddress: z.string().optional(),
    name: z.string().optional(),
  })
  .loose()

export const fundingSchema = z
  .object({
    // Имя поля не задокументировано — см. UNVERIFIED.
    availableAmount: z.coerce.bigint().optional(),
  })
  .loose()

export const eventSchema = z
  .object({
    id: eventIdSchema,
    type: z.string(),
    data: z.unknown(),
  })
  .loose()

/**
 * Страница догона.
 *
 * Нюанс, на котором легко ошибиться: непустой `nextCursor` означает
 * «запросить ещё раз», а НЕ «есть ещё события». Признак того, что
 * догнали, — пустая страница с курсором `null`.
 */
export const eventPageSchema = z
  .object({
    items: z.array(eventSchema),
    nextCursor: z.string().nullable().optional(),
  })
  .loose()

export const secretsSchema = z
  .object({
    encryptedPan: z.string(),
    encryptedCvc: z.string(),
  })
  .loose()

/**
 * Что ещё не подтверждено на песочнице.
 *
 * Чек-лист на этап 8. Каждая строка — место, где документация молчит,
 * и где расхождение вскроется только на живом API. Переключение
 * `mock` → `sandbox` — отдельный этап работ именно поэтому.
 */
export const UNVERIFIED = [
  'Имя поля с доступным залогом в GET /clients/:id/funding (сейчас availableAmount)',
  'Имя поля с депозитным адресом пула в GET /clients/:id (сейчас depositAddress)',
  'Набор значений статуса картхолдера и какое из них означает «одобрен»',
  'Единицы в PUT /cards/:id/limit: сотые доли валюты, как в событиях, или мажорные',
  'Имя поля с потолком в ответе GET /cards/:id (сейчас limit)',
  'Форма тела ошибки: точно ли { error: { code, message, params } }',
  'Есть ли в чтении транзакции поля типа и статуса и какие у них значения',
] as const

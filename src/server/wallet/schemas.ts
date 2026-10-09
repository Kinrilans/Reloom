/**
 * Zod-схемы ответов сервиса крипто-адресов.
 *
 * Всё внешнее проходит через схему до использования. Здесь это важнее,
 * чем где-либо: по этим ответам мы решаем, чьи пришли деньги и куда их
 * возвращать.
 *
 * **Формат ответов не подтверждён.** Документация сервиса в проекте
 * отсутствует, доступа к API пока нет. Поэтому схемы собраны по
 * минимуму: требуется только то, без чего операция не имеет смысла,
 * лишние поля пропускаются, а весь список непроверенного собран
 * в `UNVERIFIED` — это чек-лист на подключение.
 */

import { z } from 'zod'

/** Суммы приходят строкой или числом — принимаем оба вида и сразу
 *  переводим в минорные единицы целым числом. Плавающей точки над
 *  деньгами нет нигде, включая разбор ответов. */
const minorSchema = z.coerce.bigint()

export const assetSchema = z
  .object({
    network: z.string().min(1),
    asset: z.string().min(1),
    networkName: z.string().optional(),
    iconUrl: z.string().optional(),
    requiresMemo: z.boolean().optional(),
  })
  .loose()

export const addressSchema = z
  .object({
    id: z.string().min(1),
    network: z.string().min(1),
    asset: z.string().min(1),
    address: z.string().min(1),
    memo: z.string().optional(),
  })
  .loose()

export const incomingSchema = z
  .object({
    chainTxId: z.string().min(1),
    addressId: z.string().min(1),
    // Адрес отправителя необязателен в схеме нарочно: сеть может его
    // не отдать. Но без него возврат невозможен, и домен это знает.
    fromAddress: z.string().optional(),
    amount: minorSchema,
    asset: z.string().min(1),
    network: z.string().min(1),
    confirmations: z.coerce.number().int().nonnegative(),
    txLink: z.string().optional(),
  })
  .loose()

export const incomingPageSchema = z
  .object({
    items: z.array(incomingSchema),
    nextCursor: z.string().nullable().optional(),
  })
  .loose()

export const refundStatusSchema = z.enum(['PENDING', 'SENT', 'FAILED'])

export const refundSchema = z
  .object({
    id: z.string().min(1),
    chainTxId: z.string().min(1),
    toAddress: z.string().min(1),
    status: refundStatusSchema,
    networkFee: minorSchema.optional(),
    sentAmount: minorSchema.optional(),
  })
  .loose()

export const errorBodySchema = z
  .object({
    code: z.string().optional(),
    message: z.string().optional(),
    retryAfterSeconds: z.coerce.number().optional(),
  })
  .loose()

/**
 * Что не подтверждено.
 *
 * Чек-лист на подключение. Каждая строка — место, где расхождение
 * вскроется только на живом API, и где угадывать нельзя.
 */
export const UNVERIFIED = [
  'Отдаёт ли сервис список сетей и монет и их значки, или список ведём руками',
  'Отдаёт ли он число подтверждений по входящей транзакции и события о них',
  'Как приходит уведомление о поступлении: вебхук или опрос; чем подписан вебхук',
  'Их коды ошибок и какие из них безопасно повторять',
  'Идемпотентна ли отправка возврата и по какому ключу — до ответа не повторяем вовсе',
  'Единицы сумм в запросах и ответах: минорные или мажорные',
  'Имя и способ передачи ключа доступа (заголовок, его название)',
] as const

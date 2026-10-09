/**
 * Пополнение.
 *
 * Деньги приходят на крипто-адрес, закреплённый за пользователем. Пока
 * они на адресе, **в леджере их нет**: это ещё не деньги пользователя
 * на счёте. Проводка появляется ровно в одном случае — поступление
 * прошло подтверждения сети и проверку происхождения.
 *
 * Любой код, который трогает баланс раньше, выдаёт деньги, которых
 * у нас может не оказаться.
 *
 * Зачислить дважды можно двумя способами, и закрыты оба:
 *   1) повторное событие от сервиса адресов — ключ идемпотентности
 *      идентификатор транзакции в сети;
 *   2) двое операторов на одной заявке — захват, оптимистическая
 *      блокировка по версии записи и запрет перехода не из `SUBMITTED`.
 */

import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import type { Minor } from '@/shared/money'
import { calcFee, type FeeRate } from '../domain/fees'
import { limitAfterCredit } from '../domain/limits'
import type { CardLimitPort } from '../domain/ports'
import { depositEntries, post } from '../ledger'
import { assertSolvencyAfter, money, syncFreezeWithBalance } from './cards'

export class DepositError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'DepositError'
    this.code = code
  }
}

/** Сколько живёт захват заявки оператором. */
export const CLAIM_TTL_MS = 15 * 60 * 1000

export type AmlVerdict = 'PASSED' | 'FAILED' | 'UNAVAILABLE'

export interface IncomingDeposit {
  /** Идентификатор транзакции в сети. Ключ идемпотентности. */
  chainTxId: string
  addressId: string
  receivedMinor: Minor
  fromAddress?: string
  txLink?: string
  amlVerdict: AmlVerdict
  amlRisk?: number
}

export interface DepositOutcome {
  requestId: string
  status: 'CREDITED' | 'HELD' | 'SUBMITTED'
  /** Почему не зачислили. Код, а не текст: показывается на языке
   *  читателя (CLAUDE.md, правило 3e). */
  reasonCode?: 'AML_FAILED' | 'AML_UNAVAILABLE' | 'BELOW_MINIMUM' | 'MANUAL_MODE'
  ledgerTransactionId?: string
  netMinor?: Minor
  feeMinor?: Minor
}

interface Settings {
  depositFeeBps: number
  depositFeeFixedMinor: Minor
  depositFeeMinMinor: Minor
  minDepositMinor: Minor
  autoCreditOn: boolean
  creditWithoutAml: boolean
  amlMaxRisk: number
}

async function settingsOf(tx: Prisma.TransactionClient): Promise<Settings> {
  const row = await tx.settings.findUnique({ where: { id: 'singleton' } })
  if (!row) throw new DepositError('NO_SETTINGS', 'Настройки не заведены')
  return row
}

function depositRate(settings: Settings): FeeRate {
  return {
    bps: settings.depositFeeBps,
    fixedMinor: settings.depositFeeFixedMinor,
    minMinor: settings.depositFeeMinMinor,
  }
}

/**
 * Поступление, увиденное сервисом адресов.
 *
 * Заявка заводится **всегда**, даже когда зачислять нельзя: поступление
 * должно быть видно оператору и пользователю. Разница только в том,
 * появится ли проводка.
 */
export async function registerIncoming(
  prisma: PrismaClient,
  port: CardLimitPort,
  incoming: IncomingDeposit,
): Promise<DepositOutcome> {
  return prisma.$transaction(async (tx) => {
    // Повтор того же события. Ключ — транзакция в сети: сервис может
    // прислать её дважды, и это штатно.
    const existing = await tx.depositRequest.findUnique({
      where: { chainTxId: incoming.chainTxId },
    })
    if (existing) {
      const ledgerTx = await tx.ledgerTransaction.findFirst({
        where: { sourceType: 'CHAIN_TX', sourceId: incoming.chainTxId },
        select: { id: true },
      })
      return {
        requestId: existing.id,
        status: existing.status as DepositOutcome['status'],
        ledgerTransactionId: ledgerTx?.id,
        netMinor: existing.receivedMinor === null ? undefined : existing.receivedMinor - (existing.feeMinor ?? 0n),
        feeMinor: existing.feeMinor ?? undefined,
      }
    }

    const address = await tx.depositAddress.findUnique({
      where: { id: incoming.addressId },
      include: { network: true },
    })
    if (!address) throw new DepositError('ADDRESS_NOT_FOUND', `Адреса ${incoming.addressId} нет`)

    const settings = await settingsOf(tx)
    const reason = whyNotAutoCredit(settings, address.network, incoming)

    const request = await tx.depositRequest.create({
      data: {
        userId: address.userId,
        networkId: address.networkId,
        addressId: address.id,
        chainTxId: incoming.chainTxId,
        fromAddress: incoming.fromAddress ?? null,
        txLink: incoming.txLink ?? null,
        receivedMinor: incoming.receivedMinor,
        source: 'SYSTEM',
        amlVerdict: incoming.amlVerdict,
        amlRisk: incoming.amlRisk ?? null,
        // Не прошедшая проверку удерживается: деньги остались на адресе,
        // и это не «заявка отклонена».
        status: reason === null ? 'CREDITED' : reason === 'AML_FAILED' ? 'HELD' : 'SUBMITTED',
      },
    })

    if (reason !== null) {
      return { requestId: request.id, status: request.status as DepositOutcome['status'], reasonCode: reason }
    }

    const posted = await credit(tx, port, {
      requestId: request.id,
      userId: address.userId,
      grossMinor: incoming.receivedMinor,
      sourceType: 'CHAIN_TX',
      sourceId: incoming.chainTxId,
      settings,
    })

    await tx.depositRequest.update({
      where: { id: request.id },
      data: { feeMinor: posted.feeMinor },
    })

    return {
      requestId: request.id,
      status: 'CREDITED',
      ledgerTransactionId: posted.ledgerTransactionId,
      netMinor: posted.netMinor,
      feeMinor: posted.feeMinor,
    }
  })
}

/**
 * Почему поступление не зачисляется само. `null` — зачисляется.
 *
 * Порядок проверок значим: сначала то, что говорит о происхождении
 * денег, потом всё остальное.
 */
function whyNotAutoCredit(
  settings: Settings,
  network: { minDepositOn: boolean; minDepositMinor: Minor | null },
  incoming: IncomingDeposit,
): DepositOutcome['reasonCode'] | null {
  if (incoming.amlVerdict === 'FAILED') return 'AML_FAILED'
  if (incoming.amlVerdict === 'PASSED' && typeof incoming.amlRisk === 'number') {
    if (incoming.amlRisk > settings.amlMaxRisk) return 'AML_FAILED'
  }
  if (incoming.amlVerdict === 'UNAVAILABLE' && !settings.creditWithoutAml) {
    // Сбой стороннего сервиса не должен превращаться в канал, по
    // которому к нам заходит что угодно.
    return 'AML_UNAVAILABLE'
  }
  if (!settings.autoCreditOn) return 'MANUAL_MODE'
  // Выключенный минимум — это «минимума нет», а не «минимум ноль».
  if (network.minDepositOn && network.minDepositMinor !== null) {
    if (incoming.receivedMinor < network.minDepositMinor) return 'BELOW_MINIMUM'
  }
  return null
}

/* --------------------------------------------------------------------------
   Разбор оператором
   -------------------------------------------------------------------------- */

/**
 * Захват заявки.
 *
 * Пометка в интерфейсе («заявку разбирает такой-то») без захвата
 * бесполезна: она ничего не мешает. Захват протухает по таймауту —
 * иначе ушедший на обед оператор блокирует заявку навсегда.
 */
export async function claimDeposit(
  prisma: PrismaClient,
  requestId: string,
  operatorId: string,
  now: Date = new Date(),
): Promise<{ claimed: boolean; claimedBy: string | null }> {
  const staleBefore = new Date(now.getTime() - CLAIM_TTL_MS)
  const result = await prisma.depositRequest.updateMany({
    where: {
      id: requestId,
      status: { in: ['SUBMITTED', 'HELD'] },
      OR: [{ claimedBy: null }, { claimedBy: operatorId }, { claimedAt: { lt: staleBefore } }],
    },
    data: { claimedBy: operatorId, claimedAt: now },
  })
  if (result.count === 1) return { claimed: true, claimedBy: operatorId }

  const current = await prisma.depositRequest.findUnique({
    where: { id: requestId },
    select: { claimedBy: true },
  })
  return { claimed: false, claimedBy: current?.claimedBy ?? null }
}

export interface ConfirmResult {
  requestId: string
  ledgerTransactionId: string
  netMinor: Minor
  feeMinor: Minor
  /** Заявку уже зачислили — этот запрос ничего не создал. */
  alreadyCredited: boolean
}

/**
 * Подтверждение заявки оператором.
 *
 * Три рубежа против двойного зачисления, и убирать нельзя ни один:
 *
 *   1) переход разрешён **только из `SUBMITTED` или `HELD`**; из
 *      `CREDITED` запрос отклоняется сервером, а не спрятанной кнопкой;
 *   2) оптимистическая блокировка по версии записи: из двух
 *      одновременных запросов выигрывает один, второй получает
 *      результат первого;
 *   3) уникальный индекс в леджере по источнику проводки — последний
 *      рубеж, который нельзя обойти ни гонкой, ни ошибкой в коде.
 */
export async function confirmDeposit(
  prisma: PrismaClient,
  port: CardLimitPort,
  input: {
    requestId: string
    operatorId: string
    /** Фактически полученная сумма. Приходит столько, сколько пришло,
     *  а не сколько заявлено. */
    receivedMinor: Minor
    /** Переопределённая ставка комиссии в базисных пунктах. Задаётся
     *  оператором вручную и **требует причины**: это отступление от
     *  правил, и оно обязано быть объяснено в проводке и в аудите. */
    feeBpsOverride?: number
    reason?: string
  },
): Promise<ConfirmResult> {
  if (input.feeBpsOverride !== undefined) {
    if (!Number.isInteger(input.feeBpsOverride) || input.feeBpsOverride < 0) {
      throw new DepositError('BAD_FEE', 'Ставка задаётся целым числом базисных пунктов')
    }
    if ((input.reason ?? '').trim() === '') {
      throw new DepositError('NO_REASON', 'Переопределение комиссии требует причины')
    }
  }
  if (input.receivedMinor <= 0n) {
    throw new DepositError('BAD_AMOUNT', 'Фактически полученная сумма должна быть положительной')
  }
  return prisma.$transaction(async (tx) => {
    const request = await tx.depositRequest.findUnique({ where: { id: input.requestId } })
    if (!request) throw new DepositError('REQUEST_NOT_FOUND', `Заявки ${input.requestId} нет`)

    if (request.status === 'CREDITED') {
      // Повтор по уже зачисленной заявке. Не падаем: это могла быть
      // вторая половина гонки. Отдаём результат первой.
      return alreadyCreditedResult(tx, request.id)
    }

    if (request.status !== 'SUBMITTED' && request.status !== 'HELD') {
      throw new DepositError(
        'BAD_STATUS',
        `Заявку в состоянии ${request.status} зачислять нельзя`,
      )
    }

    // Оптимистическая блокировка. Второй одновременный запрос не найдёт
    // запись со старой версией и уйдёт в ветку «уже зачислено».
    const locked = await tx.depositRequest.updateMany({
      where: { id: request.id, version: request.version },
      data: {
        version: { increment: 1 },
        status: 'CREDITED',
        receivedMinor: input.receivedMinor,
        operatorId: input.operatorId,
      },
    })
    if (locked.count !== 1) {
      // Версия уехала — значит кто-то успел раньше. Если он довёл дело
      // до зачисления, отдаём его результат: заявка обработана, и
      // второму оператору незачем видеть ошибку. Если нет — состояние
      // непонятное, и молча продолжать нельзя.
      const fresh = await tx.depositRequest.findUniqueOrThrow({ where: { id: request.id } })
      if (fresh.status === 'CREDITED') return alreadyCreditedResult(tx, request.id)
      throw new DepositError('CONCURRENT_UPDATE', 'Заявку в этот момент изменил другой оператор')
    }

    const settings = await settingsOf(tx)
    const posted = await credit(tx, port, {
      requestId: request.id,
      userId: request.userId,
      grossMinor: input.receivedMinor,
      sourceType: 'DEPOSIT_REQUEST',
      sourceId: request.id,
      operatorId: input.operatorId,
      settings,
      ...(input.feeBpsOverride === undefined ? {} : { feeBpsOverride: input.feeBpsOverride }),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    })

    await tx.depositRequest.update({
      where: { id: request.id },
      data: { feeMinor: posted.feeMinor },
    })

    return {
      requestId: request.id,
      ledgerTransactionId: posted.ledgerTransactionId,
      netMinor: posted.netMinor,
      feeMinor: posted.feeMinor,
      alreadyCredited: posted.alreadyExisted,
    }
  })
}

/**
 * Результат уже состоявшегося зачисления.
 *
 * Проводка обязана существовать: статус `CREDITED` без проводки
 * означает, что баланс и история разошлись, и это не то состояние,
 * которое можно пережить молча.
 */
async function alreadyCreditedResult(
  tx: Prisma.TransactionClient,
  requestId: string,
): Promise<ConfirmResult> {
  const request = await tx.depositRequest.findUniqueOrThrow({ where: { id: requestId } })
  const ledgerTx = await tx.ledgerTransaction.findFirst({
    where: { sourceType: 'DEPOSIT_REQUEST', sourceId: requestId },
    select: { id: true },
  })
  if (!ledgerTx) {
    throw new DepositError('INCONSISTENT', 'Заявка зачислена, но проводки нет')
  }
  const fee = request.feeMinor ?? 0n
  return {
    requestId,
    ledgerTransactionId: ledgerTx.id,
    netMinor: (request.receivedMinor ?? 0n) - fee,
    feeMinor: fee,
    alreadyCredited: true,
  }
}

/* --------------------------------------------------------------------------
   Само зачисление
   -------------------------------------------------------------------------- */

async function credit(
  tx: Prisma.TransactionClient,
  port: CardLimitPort,
  input: {
    requestId: string
    userId: string
    grossMinor: Minor
    sourceType: 'CHAIN_TX' | 'DEPOSIT_REQUEST'
    sourceId: string
    operatorId?: string
    settings: Settings
    /** Ставка, назначенная оператором вместо расчётной. */
    feeBpsOverride?: number
    reason?: string
  },
): Promise<{ ledgerTransactionId: string; netMinor: Minor; feeMinor: Minor; alreadyExisted: boolean }> {
  const user = await tx.user.findUnique({ where: { id: input.userId } })
  if (!user) throw new DepositError('USER_NOT_FOUND', `Пользователя ${input.userId} нет`)

  // Переопределение оператора идёт тем же путём, что индивидуальная
  // ставка: оно ЗАМЕНЯЕТ расчётную, а не добавляется к ней. И так же,
  // как индивидуальная, фиксируется в проводке — изменение глобальной
  // ставки прошлые операции не пересчитывает.
  const appliedBps = input.feeBpsOverride ?? user.depositFeeBps
  const fee = calcFee(input.grossMinor, depositRate(input.settings), appliedBps)

  const posted = await post(tx, {
    type: 'DEPOSIT',
    companyId: user.companyId,
    userId: user.id,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    operatorId: input.operatorId,
    reason: input.reason,
    feeBpsUsed: fee.bpsUsed,
    entries: depositEntries(user.id, fee.netMinor, fee.feeMinor),
  })

  if (!posted.alreadyExisted) {
    await creditToPrimaryCard(tx, port, user.id, fee.netMinor)
    // Если человек был в минусе и вышел в плюс — карты, замороженные
    // именно из-за минуса, размораживаются.
    await syncFreezeWithBalance(tx, user.id)
  }

  return {
    ledgerTransactionId: posted.id,
    netMinor: fee.netMinor,
    feeMinor: fee.feeMinor,
    alreadyExisted: posted.alreadyExisted,
  }
}

/**
 * Поднять лимит главной карты на зачисленную сумму.
 *
 * Если главной активной карты нет — деньги остаются нераспределёнными
 * и ждут выпуска карты. Это штатное состояние: до первой карты и в тот
 * момент, когда главная закрывается, а новой ещё не назначили.
 *
 * **На закрывающуюся карту зачисление не идёт никогда.** С неё как раз
 * уносят остаток, и доливать туда означало бы продлевать закрытие
 * бесконечно.
 *
 * **Нехватка пула компании не отменяет зачисление.** Деньги пришли, они
 * принадлежат человеку, и отказ их принять означал бы их потерю. Но
 * выдать лимитов больше, чем есть в залоге, тоже нельзя: Oxen проверяет
 * пул раньше лимита карты, и карты начнут отказывать в случайном
 * порядке. Поэтому на карту поднимается столько, сколько пул
 * выдерживает, а остальное остаётся нераспределённым — видно как
 * падение покрытия на дашборде, а не как пропавшие деньги.
 */
async function creditToPrimaryCard(
  tx: Prisma.TransactionClient,
  port: CardLimitPort,
  userId: string,
  netMinor: Minor,
): Promise<void> {
  if (netMinor === 0n) return

  const primary = await tx.card.findFirst({
    where: { userId, isPrimary: true, status: { in: ['ACTIVE', 'FROZEN'] } },
  })
  if (!primary) return

  const grant = await poolHeadroom(tx, userId, netMinor)
  if (grant <= 0n) return

  const newLimit = limitAfterCredit(money(primary), grant)
  // Проверка остаётся на месте: она не декоративная, а последний рубеж
  // на случай, если расчёт выше окажется неверным.
  await assertSolvencyAfter(tx, userId, primary.id, newLimit)
  await port.setLimit(primary.oxenCardId, newLimit)
  await tx.card.update({ where: { id: primary.id }, data: { appliedLimit: newLimit } })
}

/** Сколько ещё можно выдать по пулу компании, но не больше желаемого. */
async function poolHeadroom(
  tx: Prisma.TransactionClient,
  userId: string,
  wanted: Minor,
): Promise<Minor> {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { companyId: true },
  })
  const company = await tx.company.findUniqueOrThrow({ where: { id: user.companyId } })
  const cards = await tx.card.findMany({
    where: { status: { in: ['ACTIVE', 'FROZEN', 'CLOSING'] }, user: { companyId: user.companyId } },
  })
  const allocated = cards.reduce<Minor>(
    (sum, card) => sum + (card.appliedLimit - card.settledMinor - card.pendingMinor),
    0n,
  )
  const headroom = company.poolAvailableMinor - allocated
  return headroom < wanted ? headroom : wanted
}

/* --------------------------------------------------------------------------
   Предварительный расчёт
   -------------------------------------------------------------------------- */

export interface DepositPreview {
  grossMinor: Minor
  feeMinor: Minor
  netMinor: Minor
  bpsUsed: number
  fixedMinor: Minor
  minFeeMinor: Minor
  /** Сумма меньше минимальной для пополнения. Это **предупреждение**,
   *  а не запрет: деньги уже пришли, и отказываться их зачислять
   *  нельзя (docs/flows-admin.md, «Лимиты сумм»). */
  belowMinimum: boolean
  minDepositMinor: Minor
}

/**
 * Что получится при зачислении.
 *
 * Отдельная функция нужна затем, чтобы итог, который оператор видит
 * до нажатия кнопки, считался **тем же кодом**, что и сама проводка.
 * Второй расчёт «только для показа» однажды разойдётся с первым, и
 * человек подтвердит одну сумму, а зачислится другая.
 */
export async function previewDeposit(
  prisma: PrismaClient,
  input: { userId: string; grossMinor: Minor; feeBpsOverride?: number },
): Promise<DepositPreview> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } })
  if (!user) throw new DepositError('USER_NOT_FOUND', `Пользователя ${input.userId} нет`)
  const settings = await settingsOf(prisma)

  const rate = depositRate(settings)
  const fee = calcFee(input.grossMinor, rate, input.feeBpsOverride ?? user.depositFeeBps)

  return {
    grossMinor: fee.grossMinor,
    feeMinor: fee.feeMinor,
    netMinor: fee.netMinor,
    bpsUsed: fee.bpsUsed,
    fixedMinor: rate.fixedMinor,
    minFeeMinor: rate.minMinor ?? 0n,
    belowMinimum: input.grossMinor < settings.minDepositMinor,
    minDepositMinor: settings.minDepositMinor,
  }
}

/* --------------------------------------------------------------------------
   Отклонение
   -------------------------------------------------------------------------- */

/** Причины отклонения. Выбираются из списка, а не пишутся текстом:
 *  пользователь может читать интерфейс по-английски, и свободный текст
 *  уйдёт к нему непереведённым (CLAUDE.md, правило 3e). */
export const REJECT_REASONS = ['PAYMENT_NOT_FOUND', 'AMOUNT_MISMATCH', 'NO_TX_LINK', 'OTHER'] as const
export type RejectReason = (typeof REJECT_REASONS)[number]

/**
 * Отклонить заявку.
 *
 * Те же три рубежа, что и на подтверждении: переход только из
 * `SUBMITTED` или `HELD`, оптимистическая блокировка по версии,
 * повтор по уже отклонённой заявке не ошибка.
 *
 * Проводки не создаёт: отклонённая заявка денег не двигала.
 */
export async function rejectDeposit(
  prisma: PrismaClient,
  input: {
    requestId: string
    operatorId: string
    reasonCode: RejectReason
    /** Свободный комментарий. Уходит пользователю как есть, поэтому
     *  рядом с кодом сохраняется язык, на котором он написан. */
    reasonText?: string
    reasonLang?: string
  },
): Promise<{ requestId: string; alreadyRejected: boolean }> {
  if (!REJECT_REASONS.includes(input.reasonCode)) {
    throw new DepositError('BAD_REASON', `Неизвестная причина отклонения: ${input.reasonCode}`)
  }
  if (input.reasonCode === 'OTHER' && (input.reasonText ?? '').trim() === '') {
    throw new DepositError('NO_REASON', 'Причина «другое» требует пояснения')
  }

  const request = await prisma.depositRequest.findUnique({ where: { id: input.requestId } })
  if (!request) throw new DepositError('REQUEST_NOT_FOUND', `Заявки ${input.requestId} нет`)
  if (request.status === 'REJECTED') return { requestId: request.id, alreadyRejected: true }
  if (request.status !== 'SUBMITTED' && request.status !== 'HELD') {
    throw new DepositError('BAD_STATUS', `Заявку в состоянии ${request.status} отклонять нельзя`)
  }

  const locked = await prisma.depositRequest.updateMany({
    where: { id: request.id, version: request.version },
    data: {
      version: { increment: 1 },
      status: 'REJECTED',
      operatorId: input.operatorId,
      rejectReasonCode: input.reasonCode,
      rejectReasonText: input.reasonText ?? null,
      rejectReasonLang: input.reasonText ? (input.reasonLang ?? 'ru') : null,
    },
  })
  if (locked.count !== 1) {
    const fresh = await prisma.depositRequest.findUniqueOrThrow({ where: { id: request.id } })
    if (fresh.status === 'REJECTED') return { requestId: request.id, alreadyRejected: true }
    throw new DepositError('CONCURRENT_UPDATE', 'Заявку в этот момент изменил другой оператор')
  }

  return { requestId: request.id, alreadyRejected: false }
}

/* --------------------------------------------------------------------------
   Возврат отправителю
   -------------------------------------------------------------------------- */

/**
 * Возврат средств, не прошедших проверку происхождения.
 *
 * **Проводок не создаёт и баланс не меняет.** Деньги в леджер не
 * попадали: они лежат на крипто-адресе, пришли туда извне и уходят
 * туда же. Комиссию сети удерживает сервис кошелька, нашей комиссии
 * нет — денег мы не получили, услуги не оказали.
 *
 * Получатель ровно один — адрес, с которого пришли средства. Выбора
 * здесь нет и быть не может.
 *
 * Адрес после возврата уничтожается и больше не используется.
 */
export async function markRefunded(
  prisma: PrismaClient,
  requestId: string,
): Promise<{ toAddress: string; burnedAddressId: string }> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.depositRequest.findUnique({ where: { id: requestId } })
    if (!request) throw new DepositError('REQUEST_NOT_FOUND', `Заявки ${requestId} нет`)
    if (request.status !== 'HELD') {
      throw new DepositError('BAD_STATUS', 'Возврат возможен только по удержанному поступлению')
    }
    if (!request.fromAddress) {
      throw new DepositError('NO_SENDER', 'Адрес отправителя неизвестен — возвращать некуда')
    }

    await tx.depositRequest.update({ where: { id: requestId }, data: { status: 'REFUNDED' } })
    await tx.depositAddress.update({
      where: { id: request.addressId },
      data: { status: 'BURNED', burnReason: 'REFUNDED', burnedAt: new Date() },
    })

    return { toAddress: request.fromAddress, burnedAddressId: request.addressId }
  })
}

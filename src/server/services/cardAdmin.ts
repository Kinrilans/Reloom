/**
 * Действия оператора над картами.
 *
 * Обычно карты выпускает и распределяет сам пользователь: оператор
 * отвечает за денежный контур, а не за то, на какой карте человек
 * держит свои деньги. Здесь — то, чем оператор вмешивается:
 * первый выпуск, заморозка, закрытие, перечитывание при расхождении.
 *
 * **Абсолютное значение лимита оператор не вводит нигде.** Он
 * оперирует суммой «выделить N», а потолок считает код по формуле
 * `потрачено + остаток` (CLAUDE.md, правила 2 и 3).
 */

import type { PrismaClient } from '@/generated/prisma/client'
import type { Minor } from '@/shared/money'
import { writeAudit } from '../audit'
import { remainingOf } from '../domain/limits'
import type { OxenClient } from '../oxen'
import { issuePort, limitPort, statePort } from '../oxen/ports'
import {
  CardError,
  assertSolvencyAfter,
  hasFreeSlot,
  money,
  setCardRemaining,
  unallocated,
} from './cards'
import { cancelClosing, startClosing, type ClosingPlan } from './closing'
import { requireRight, type ActingOperator } from './rights'
import { newCardId } from './users'

export { CardError }

/**
 * Выпустить карту.
 *
 * Порядок обязателен и не переставляется:
 *
 *   1. проверки — картхолдер одобрен, слот свободен, денег хватает;
 *   2. намерение с идемпотентным ключом в базу;
 *   3. вызов эмитента;
 *   4. запись карты у себя.
 *
 * Если процесс умрёт между 3 и 4, карта у эмитента окажется, а у нас
 * нет. Это видно в «Состоянии системы» как застрявший вызов — и
 * разбирается человеком. Альтернатива, при которой запись идёт
 * первой, хуже: тогда у нас есть карта, которой нет у эмитента, и
 * пользователь видит рабочую карту, которой не существует.
 *
 * Сумма задаётся как «сколько выделить», а потолок считается: у новой
 * карты потраченного нет, поэтому они совпадают — но совпадают
 * **один раз**, и писать `limit = amount` в коде нельзя, иначе та же
 * строка переживёт первую трату.
 */
export async function issueCard(
  prisma: PrismaClient,
  oxen: OxenClient,
  operator: ActingOperator,
  input: { userId: string; allocateMinor: Minor },
): Promise<{ cardId: string; oxenCardId: string; last4: string; isPrimary: boolean }> {
  requireRight(operator, 'MANAGE_USERS')

  if (input.allocateMinor < 0n) {
    throw new CardError('BAD_AMOUNT', 'Выделить можно неотрицательную сумму')
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } })
  if (!user) throw new CardError('USER_NOT_FOUND', `Пользователя ${input.userId} нет`)
  if (user.status === 'BLOCKED') {
    throw new CardError('USER_BLOCKED', 'Заблокированному пользователю карту не выпускают')
  }
  if (!user.oxenCardholderId) {
    throw new CardError('NO_CARDHOLDER', 'Сначала заведите пользователя у эмитента')
  }
  // Требуется именно явное одобрение. Пустой статус означает «мы его
  // не читали», и это не повод считать человека проверенным: карта,
  // выпущенная непроверенному, — проблема не наша только на словах.
  if (user.oxenStatus?.toUpperCase() !== 'APPROVED') {
    throw new CardError(
      'CARDHOLDER_NOT_APPROVED',
      `Картхолдер ещё не одобрен (${user.oxenStatus ?? 'статус не читали'}) — карту выпускать нельзя`,
    )
  }
  if (!(await hasFreeSlot(prisma, input.userId))) {
    throw new CardError('NO_FREE_SLOT', 'Свободных слотов под карту нет')
  }

  // Нераспределённое — это деньги, которые уже на балансе, но ещё не
  // лежат ни на одной карте. Выделять больше нельзя: сумма остатков
  // по картам не может превысить баланс (CLAUDE.md, правило 4).
  const free = await unallocated(prisma, input.userId)
  if (input.allocateMinor > free) {
    throw new CardError(
      'NOT_ENOUGH_UNALLOCATED',
      `Нераспределённого остатка ${free}, запрошено ${input.allocateMinor}`,
    )
  }

  const cardId = newCardId()
  // Проверка платёжеспособности компании — на будущем состоянии,
  // с картой, которой ещё нет. `assertSolvencyAfter` считает её как
  // новую строку, потому что по этому идентификатору карты нет.
  await assertSolvencyAfter(prisma, input.userId, cardId, input.allocateMinor)

  const issued = await issuePort(oxen, prisma, cardId).issueCard({
    oxenCardholderId: user.oxenCardholderId,
    limitMinor: input.allocateMinor,
  })

  const existing = await prisma.card.count({ where: { userId: input.userId } })
  const card = await prisma.card.create({
    data: {
      id: cardId,
      userId: input.userId,
      oxenCardId: issued.oxenCardId,
      last4: issued.last4,
      // Первая карта пользователя — главная: она играет роль счёта,
      // на неё зачисляются пополнения.
      isPrimary: existing === 0,
      status: 'ACTIVE',
      appliedLimit: input.allocateMinor,
    },
  })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'CARD_ISSUED',
    targetType: 'CARD',
    targetId: card.id,
    targetName: card.last4 ?? issued.oxenCardId,
    companyId: user.companyId,
    after: { oxenCardId: issued.oxenCardId, allocated: input.allocateMinor, isPrimary: card.isPrimary },
  })

  return {
    cardId: card.id,
    oxenCardId: issued.oxenCardId,
    last4: issued.last4,
    isPrimary: card.isPrimary,
  }
}

/**
 * Заморозить карту.
 *
 * Сначала эмитент, потом своя база: заморозка, записанная только
 * у нас, оставляет карту рабочей.
 */
export async function freezeCard(
  prisma: PrismaClient,
  oxen: OxenClient,
  operator: ActingOperator,
  cardId: string,
): Promise<void> {
  requireRight(operator, 'MANAGE_USERS')

  const card = await prisma.card.findUnique({ where: { id: cardId }, include: { user: true } })
  if (!card) throw new CardError('CARD_NOT_FOUND', `Карты ${cardId} нет`)
  if (card.status === 'CANCELED') {
    throw new CardError('CARD_TERMINAL', 'Карта отменена, отмена необратима')
  }
  if (card.status === 'CLOSING') {
    throw new CardError('CARD_CLOSING', 'Закрывающаяся карта уже заморожена')
  }
  if (card.status === 'FROZEN') return

  await oxen.freezeCard(card.oxenCardId)
  await prisma.card.update({
    where: { id: card.id },
    data: { status: 'FROZEN', freezeReason: 'BY_OPERATOR' },
  })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'CARD_FROZEN',
    targetType: 'CARD',
    targetId: card.id,
    targetName: card.last4 ?? card.oxenCardId,
    companyId: card.user.companyId,
    before: { status: card.status },
    after: { status: 'FROZEN', freezeReason: 'BY_OPERATOR' },
  })
}

/**
 * Разморозить.
 *
 * Карту, замороженную из-за минуса, разморозить нельзя: сначала
 * баланс надо вывести из минуса, иначе следующая же трата вернёт
 * её туда же, только с большим долгом.
 */
export async function unfreezeCard(
  prisma: PrismaClient,
  oxen: OxenClient,
  operator: ActingOperator,
  cardId: string,
): Promise<void> {
  requireRight(operator, 'MANAGE_USERS')

  const card = await prisma.card.findUnique({ where: { id: cardId }, include: { user: true } })
  if (!card) throw new CardError('CARD_NOT_FOUND', `Карты ${cardId} нет`)
  if (card.status !== 'FROZEN') {
    throw new CardError('NOT_FROZEN', 'Карта не заморожена')
  }
  if (card.freezeReason === 'NEGATIVE_BALANCE') {
    throw new CardError(
      'NEGATIVE_BALANCE',
      'Карта заморожена из-за отрицательного баланса — сначала выведите баланс из минуса',
    )
  }
  if (card.user.status === 'BLOCKED') {
    throw new CardError('USER_BLOCKED', 'Пользователь заблокирован — сначала разблокируйте его')
  }

  await oxen.unfreezeCard(card.oxenCardId)
  await prisma.card.update({
    where: { id: card.id },
    data: { status: 'ACTIVE', freezeReason: null },
  })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'CARD_UNFROZEN',
    targetType: 'CARD',
    targetId: card.id,
    targetName: card.last4 ?? card.oxenCardId,
    companyId: card.user.companyId,
    before: { status: 'FROZEN', freezeReason: card.freezeReason },
    after: { status: 'ACTIVE' },
  })
}

/**
 * Закрыть карту: перевод в `CLOSING`.
 *
 * Прямой отмены в обход закрытия нет. Отмена в Oxen необратима, и
 * отменить карту с деньгами или с незакрытой авторизацией означает
 * потерять их.
 */
export async function closeCard(
  prisma: PrismaClient,
  oxen: OxenClient,
  operator: ActingOperator,
  input: { cardId: string; plan: ClosingPlan },
): Promise<void> {
  requireRight(operator, 'MANAGE_USERS')

  const card = await prisma.card.findUnique({ where: { id: input.cardId }, include: { user: true } })
  if (!card) throw new CardError('CARD_NOT_FOUND', `Карты ${input.cardId} нет`)

  await startClosing(prisma, statePort(oxen), { cardId: input.cardId, plan: input.plan })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'CARD_CLOSING_STARTED',
    targetType: 'CARD',
    targetId: card.id,
    targetName: card.last4 ?? card.oxenCardId,
    companyId: card.user.companyId,
    before: { status: card.status },
    after: { status: 'CLOSING', plan: input.plan },
  })
}

/** Вернуть карту в работу, пока она в `CLOSING` и не отменена. */
export async function reopenCard(
  prisma: PrismaClient,
  oxen: OxenClient,
  operator: ActingOperator,
  cardId: string,
): Promise<void> {
  requireRight(operator, 'MANAGE_USERS')

  const card = await prisma.card.findUnique({ where: { id: cardId }, include: { user: true } })
  if (!card) throw new CardError('CARD_NOT_FOUND', `Карты ${cardId} нет`)

  await cancelClosing(prisma, statePort(oxen), cardId)

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'CARD_REOPENED',
    targetType: 'CARD',
    targetId: card.id,
    targetName: card.last4 ?? card.oxenCardId,
    companyId: card.user.companyId,
    before: { status: 'CLOSING' },
    after: { status: 'ACTIVE' },
  })
}

/**
 * Перечитать карту у эмитента.
 *
 * Ручная синхронизация при расхождении. Потолок берётся из чтения:
 * подтверждённое эмитентом значение главнее нашего представления
 * о нём. Потраченное не трогаем — его ведёт зеркало транзакций.
 */
export async function refreshCard(
  prisma: PrismaClient,
  oxen: OxenClient,
  cardId: string,
): Promise<{ status: string; appliedLimit: Minor; changed: boolean }> {
  const card = await prisma.card.findUnique({ where: { id: cardId } })
  if (!card) throw new CardError('CARD_NOT_FOUND', `Карты ${cardId} нет`)

  const read = await oxen.getCard(card.oxenCardId)
  const limit = read.limitMinor ?? card.appliedLimit

  // Наш `CLOSING` у эмитента выглядит как `FROZEN`. Перетирать его
  // нельзя: потеряются и намерение закрыть карту, и выбранный план
  // переноса остатка.
  const status = card.status === 'CLOSING' && read.status === 'FROZEN' ? 'CLOSING' : read.status
  const changed = status !== card.status || limit !== card.appliedLimit

  if (changed) {
    await prisma.card.update({
      where: { id: card.id },
      data: {
        status,
        appliedLimit: limit,
        ...(status === 'ACTIVE' ? { freezeReason: null } : {}),
        ...(read.last4 === undefined ? {} : { last4: read.last4 }),
      },
    })
  }

  return { status, appliedLimit: limit, changed }
}

/**
 * Выделить карте сумму с нераспределённого остатка.
 *
 * Оператору на экране карты это действие не предлагается
 * (`docs/flows-admin.md`, п. 4): распределение делает пользователь.
 * Здесь оно нужно первому выпуску и переносам — и именно в виде
 * «выделить N», а не «поставить потолок N».
 */
export async function allocateToCard(
  prisma: PrismaClient,
  oxen: OxenClient,
  input: { cardId: string; deltaMinor: Minor },
): Promise<{ appliedLimit: Minor }> {
  if (input.deltaMinor === 0n) throw new CardError('BAD_AMOUNT', 'Ноль ничего не меняет')

  return prisma.$transaction(async (tx) => {
    const card = await tx.card.findUnique({ where: { id: input.cardId } })
    if (!card) throw new CardError('CARD_NOT_FOUND', `Карты ${input.cardId} нет`)

    const desired = remainingOf(money(card)) + input.deltaMinor
    if (desired < 0n) {
      throw new CardError('NOT_ENOUGH_REMAINING', 'На карте меньше, чем просят снять')
    }

    const applied = await setCardRemaining(tx, limitPort(oxen), card.id, desired)
    return { appliedLimit: applied }
  })
}

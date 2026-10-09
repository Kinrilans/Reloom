/**
 * Демо-данные клиентской части.
 *
 * Числа посчитаны руками и записаны готовыми. Переход между состояниями —
 * подмена сценария, а не вычисление (docs/prototype.md).
 *
 * Названия мерчантов намеренно сырые, как их отдаёт эмитент
 * (`SQ *COFFEE SHOP 4411`): логотипов и категорий в API нет, и лента
 * должна выглядеть нормально без них. Суммы с копейками, даты вразнобой,
 * операции в разных валютах, отклонённые с разными причинами — красивые
 * круглые суммы и три строки в списке скрывают проблемы вёрстки.
 *
 * Номера карт выдуманные и невалидны по контрольной сумме.
 */

import type {
  AppNotification,
  Asset,
  Card,
  IncomingDeposit,
  Network,
  Operation,
  Scenario,
} from './types'

/**
 * Сети и монеты, открытые оператором в админке. Повторяют активные записи
 * из src/fixtures/admin.ts: пользователь видит ровно то, что оператор
 * завёл, и ничего сверх.
 *
 * Монета у сети своя: один и тот же Ethereum принимает и USDT, и USDC, и
 * это разные адреса. Перевод не той монетой теряется так же, как перевод
 * не в той сети, поэтому выбирается именно пара «монета + сеть».
 */
export const NETWORKS: Network[] = [
  {
    id: 'trc20-usdt',
    name: 'Tron (TRC-20)',
    asset: 'USDT',
    iconUrl: null,
    address: 'TQ5nR8vK2mXpL7dYwF3jH9cB4tZaS6eNqU',
  },
  {
    id: 'erc20-usdt',
    name: 'Ethereum (ERC-20)',
    asset: 'USDT',
    iconUrl: null,
    address: '0x7F4c9A2bE81dC3650aF19b7D4e2C8a05B36fE914',
  },
  {
    id: 'ton-usdt',
    name: 'TON',
    asset: 'USDT',
    iconUrl: null,
    address: 'UQD2k7bXnLmR4vP9cJ8tY6wE3aZqH5fN1gVxMcB7dKuT',
    memo: '48201937',
    memoLabel: 'Memo',
  },
  {
    id: 'erc20-usdc',
    name: 'Ethereum (ERC-20)',
    asset: 'USDC',
    iconUrl: null,
    address: '0x3A9dE1c47B20fF8562aD93c1E7b045F8cA216D73',
  },
]

/** Монеты в порядке показа. Список закрытый: монета, которой нет
 *  у эмитента, зачислена не будет (docs/flows-user.md). */
export const ASSETS: Asset[] = [
  { id: 'USDT', name: 'Tether', iconUrl: null },
  { id: 'USDC', name: 'USD Coin', iconUrl: null },
]

/* --- Операции -------------------------------------------------------------- */

const SPEND_OPERATIONS: Operation[] = [
  {
    id: 'op-1',
    type: 'spend',
    status: 'pending',
    merchant: 'SQ *COFFEE SHOP 4411',
    cardId: 'card-primary',
    cardLast4: '4417',
    amount: '-12.40',
    currency: 'USD',
    authorized: '12.40',
    occurredAt: '2026-10-05T10:45:00Z',
  },
  {
    id: 'op-2',
    type: 'spend',
    status: 'completed',
    merchant: 'AMAZON MKTPL*2H4KL',
    cardId: 'card-primary',
    cardLast4: '4417',
    amount: '-49.99',
    currency: 'USD',
    authorized: '49.99',
    settled: '49.99',
    occurredAt: '2026-10-04T20:12:00Z',
    settledAt: '2026-10-05T03:18:00Z',
  },
  {
    id: 'op-3',
    type: 'spend',
    status: 'completed',
    merchant: 'CARREFOUR CITY 0391',
    cardId: 'card-child',
    cardLast4: '9032',
    amount: '-112.40',
    currency: 'USD',
    localAmount: '100.00',
    localCurrency: 'EUR',
    authorized: '110.00',
    settled: '112.40',
    diffReason: 'rate',
    derivedRate: '1.1240 USD / EUR',
    occurredAt: '2026-10-03T14:02:00Z',
    settledAt: '2026-10-04T09:40:00Z',
  },
  {
    id: 'op-4',
    type: 'spend',
    status: 'completed',
    merchant: 'HOTEL ARTEMIDE ROMA',
    cardId: 'card-primary',
    cardLast4: '4417',
    amount: '-248.60',
    currency: 'USD',
    localAmount: '226.00',
    localCurrency: 'EUR',
    authorized: '220.00',
    settled: '248.60',
    diffReason: 'tips',
    derivedRate: '1.1000 USD / EUR',
    occurredAt: '2026-10-02T18:30:00Z',
    settledAt: '2026-10-04T11:05:00Z',
  },
  {
    id: 'op-5',
    type: 'refund',
    status: 'refund',
    merchant: 'ZARA ES 2281',
    cardId: 'card-child',
    cardLast4: '9032',
    amount: '+107.30',
    currency: 'USD',
    localAmount: '100.00',
    localCurrency: 'EUR',
    refundPurchase: '110.00',
    refundPurchaseLocal: '100.00',
    occurredAt: '2026-10-02T12:15:00Z',
  },
  {
    id: 'op-6',
    type: 'spend',
    status: 'declined',
    merchant: 'UBER *TRIP',
    cardId: 'card-child',
    cardLast4: '9032',
    amount: '-18.00',
    currency: 'USD',
    declineReasonCode: 'insufficient_funds',
    occurredAt: '2026-10-02T09:31:00Z',
  },
  {
    id: 'op-7',
    type: 'spend',
    status: 'declined',
    merchant: 'STEAM PURCHASE',
    cardId: 'card-primary',
    cardLast4: '4417',
    amount: '-24.99',
    currency: 'USD',
    declineReasonCode: 'maintenance',
    occurredAt: '2026-10-01T22:10:00Z',
  },
  {
    id: 'op-8',
    type: 'transfer',
    status: 'completed',
    titleKey: 'op.type.transfer',
    amount: '200.00',
    currency: 'USD',
    occurredAt: '2026-10-01T15:00:00Z',
  },
  {
    id: 'op-9',
    type: 'deposit',
    status: 'completed',
    titleKey: 'op.type.deposit',
    amount: '+1 470.00',
    currency: 'USD',
    occurredAt: '2026-09-28T11:20:00Z',
  },
  {
    id: 'op-10',
    type: 'spend',
    status: 'reversed',
    merchant: 'BOOKING.COM AMSTERDAM',
    cardId: 'card-primary',
    cardLast4: '4417',
    amount: '-310.00',
    currency: 'USD',
    occurredAt: '2026-09-27T08:05:00Z',
  },
  {
    id: 'op-11',
    type: 'spend',
    status: 'completed',
    merchant: 'YANDEX TAXI',
    cardId: 'card-child',
    cardLast4: '9032',
    amount: '-8.15',
    currency: 'USD',
    settled: '8.15',
    occurredAt: '2026-09-26T19:44:00Z',
  },
  {
    id: 'op-12',
    type: 'withdrawal',
    status: 'completed',
    titleKey: 'op.type.withdrawal',
    amount: '-300.00',
    currency: 'USD',
    occurredAt: '2026-09-25T13:00:00Z',
  },
]

/** Пополнение, согласованное с расчётом из DEMO.depositFee: отправлено 500,
 *  удержано 10, зачислено 490. Используется сценариями, где карт ещё нет. */
const FIRST_DEPOSIT: Operation = {
  id: 'op-first-deposit',
  type: 'deposit',
  status: 'completed',
  titleKey: 'op.type.deposit',
  amount: '+490.00',
  currency: 'USD',
  occurredAt: '2026-10-04T12:30:00Z',
}

const HELD_OPERATIONS: Operation[] = [
  {
    id: 'held-1',
    type: 'spend',
    status: 'pending',
    merchant: 'HOTEL ARTEMIDE ROMA',
    cardLast4: '4417',
    amount: '-96.00',
    currency: 'USD',
    authorized: '96.00',
    occurredAt: '2026-10-04T18:30:00Z',
  },
  {
    id: 'held-2',
    type: 'spend',
    status: 'pending',
    merchant: 'SQ *COFFEE SHOP 4411',
    cardLast4: '4417',
    amount: '-24.00',
    currency: 'USD',
    authorized: '24.00',
    occurredAt: '2026-10-05T08:12:00Z',
  },
]

/* --- Карты ----------------------------------------------------------------- */

const PRIMARY: Card = {
  id: 'card-primary',
  last4: '4417',
  isPrimary: true,
  status: 'ACTIVE',
  expires: '09/29',
  available: '820.00',
  spent: '180.00',
  currency: 'USD',
}

const CHILD: Card = {
  id: 'card-child',
  last4: '9032',
  isPrimary: false,
  status: 'ACTIVE',
  expires: '11/29',
  available: '420.00',
  spent: '60.00',
  currency: 'USD',
}

/* --- Сценарии ---------------------------------------------------------------
   Названия соответствуют состояниям из docs/states-user.md. */

const BASE = {
  name: 'Сергей',
  currency: 'USD',
  profileStatus: 'APPROVED' as const,
}

/* --- Поступления в работе -----------------------------------------------------
   Транзакцию на адрес система видит сама, ещё до того как она
   подтвердится. Пользователю это показывается сразу: деньги уже ушли
   с его кошелька, и до зачисления он не должен гадать, дошли они или нет. */

const INCOMING_CONFIRMING: IncomingDeposit = {
  id: 'in-1',
  status: 'confirming',
  amount: '500.00',
  asset: 'USDT',
  network: 'Tron (TRC-20)',
  confirmations: '1',
  confirmationsNeeded: '3',
  from: 'TLs9xK4nQ2vM7pD1wY8jF3cB6tZaS5eNqR',
  txLink: 'https://tronscan.org/#/transaction/9f2c1a7b4e',
  startedAt: '2026-10-05T14:02:00Z',
  fee: '9.50',
  net: '490.50',
}

/* Второе поступление, в другой сети и на другом шаге: по списку должно
   быть видно, что шаги у них разные. */
const INCOMING_CHECKING: IncomingDeposit = {
  id: 'in-3',
  status: 'checking',
  amount: '250.00',
  asset: 'USDC',
  network: 'Ethereum (ERC-20)',
  confirmations: '14',
  confirmationsNeeded: '12',
  from: '0x2E8bD53aC90fB147d6A29c8E4b703fA51cD9E286',
  txLink: 'https://etherscan.io/tx/0x8a2d41bc',
  startedAt: '2026-10-05T13:20:00Z',
  fee: '5.75',
  net: '244.25',
}

const INCOMING_REJECTED: IncomingDeposit = {
  id: 'in-2',
  status: 'rejected',
  amount: '1 200.00',
  asset: 'USDT',
  network: 'Ethereum (ERC-20)',
  confirmations: '12',
  confirmationsNeeded: '3',
  from: '0x9D4eB2a7F31cA685b0E73d5C9f216aB84cD0E372',
  txLink: 'https://etherscan.io/tx/0x4b1fc7a2',
  startedAt: '2026-10-05T18:40:00Z',
  fee: '0.00',
  net: '0.00',
}

/**
 * Готовые пары «отправите → удержим → зачислится».
 *
 * Это и есть калькулятор пополнения: суммы подготовлены заранее, в коде
 * не считается ничего. Живой пересчёт произвольной суммы появится на
 * этапе 1 вместе с леджером и тестами (docs/prototype.md, правило 3f) —
 * комиссия, посчитанная «на глаз, чтобы показать», переживает прототип
 * и всплывает уже на реальных деньгах.
 *
 * Значения сходятся со ставкой из админки: 150 б.п. + 2.00 USD.
 */
export const DEPOSIT_TABLE = [
  { gross: '100.00', fee: '3.50', net: '96.50' },
  { gross: '500.00', fee: '9.50', net: '490.50' },
  { gross: '1 000.00', fee: '17.00', net: '983.00' },
  { gross: '5 000.00', fee: '77.00', net: '4 923.00' },
]

export const SCENARIOS: Record<string, Scenario> = {
  /** Основной: две активные карты, обычная работа. */
  default: {
    ...BASE,
    id: 'default',
    label: 'Активный пользователь, две карты',
    balance: '1 240.00',
    cards: [PRIMARY, CHILD],
    operations: SPEND_OPERATIONS,
    incoming: [INCOMING_CONFIRMING, INCOMING_CHECKING],
  },

  /** Поступление не прошло проверку: деньги не зачислены и ждут возврата. */
  incomingRejected: {
    ...BASE,
    id: 'incomingRejected',
    label: 'Поступление не прошло проверку',
    balance: '1 240.00',
    cards: [PRIMARY, CHILD],
    operations: SPEND_OPERATIONS,
    incoming: [INCOMING_REJECTED],
  },

  /** Подтверждений хватило, идёт проверка происхождения средств. */
  incomingChecking: {
    ...BASE,
    id: 'incomingChecking',
    label: 'Поступление на проверке',
    balance: '1 240.00',
    cards: [PRIMARY, CHILD],
    operations: SPEND_OPERATIONS,
    incoming: [INCOMING_CHECKING],
  },

  /** Б-1. Нет карт, баланс нулевой — первый экран после привязки. */
  empty: {
    ...BASE,
    id: 'empty',
    label: 'Б-1. Нет карт, баланс нулевой',
    balance: '0.00',
    cards: [],
    operations: [],
  },

  /** Б-2. Нет карт, но баланс есть. */
  funded: {
    ...BASE,
    id: 'funded',
    label: 'Б-2. Нет карт, баланс есть',
    balance: '490.00',
    unallocated: '490.00',
    cards: [],
    operations: [FIRST_DEPOSIT],
  },

  /** Состояние сразу после выпуска первой карты: весь баланс на главной. */
  fundedOneCard: {
    ...BASE,
    id: 'fundedOneCard',
    label: 'Главная карта выпущена, баланс на ней',
    balance: '490.00',
    cards: [{ ...PRIMARY, available: '490.00', spent: '0.00' }],
    operations: [FIRST_DEPOSIT],
  },

  /** Две карты сразу после выпуска второй: перевод ещё не делали, поэтому
   *  весь баланс остался на главной. Суммы согласованы с fundedOneCard —
   *  при подмене сценария баланс не должен меняться сам по себе. */
  fundedTwoCards: {
    ...BASE,
    id: 'fundedTwoCards',
    label: 'Две карты, средства на главной',
    balance: '490.00',
    cards: [
      { ...PRIMARY, available: '490.00', spent: '0.00' },
      { ...CHILD, available: '0.00', spent: '0.00' },
    ],
    operations: [FIRST_DEPOSIT],
  },

  /** Те же две карты после перевода 200.00 с главной на дочернюю. */
  fundedAfterTransfer: {
    ...BASE,
    id: 'fundedAfterTransfer',
    label: 'Две карты после перевода',
    balance: '490.00',
    cards: [
      { ...PRIMARY, available: '290.00', spent: '0.00' },
      { ...CHILD, available: '200.00', spent: '0.00' },
    ],
    operations: [FIRST_DEPOSIT],
  },

  /** Одна карта: вторую ещё можно выпустить. */
  oneCard: {
    ...BASE,
    id: 'oneCard',
    label: 'Одна карта, можно выпустить вторую',
    balance: '1 240.00',
    cards: [{ ...PRIMARY, available: '1 240.00' }],
    operations: SPEND_OPERATIONS,
  },

  /** Состояние после перевода 200.00 с главной на дочернюю. */
  afterTransfer: {
    ...BASE,
    id: 'afterTransfer',
    label: 'После перевода между картами',
    balance: '1 240.00',
    cards: [
      { ...PRIMARY, available: '620.00' },
      { ...CHILD, available: '620.00' },
    ],
    operations: SPEND_OPERATIONS,
  },

  /** Б-6. Перевод выполняется: вторая попытка заблокирована. */
  transferPending: {
    ...BASE,
    id: 'transferPending',
    label: 'Б-6. Перевод выполняется',
    balance: '1 240.00',
    cards: [
      { ...PRIMARY, available: '620.00', transferPending: true },
      { ...CHILD, available: '420.00', transferPending: true },
    ],
    operations: SPEND_OPERATIONS,
  },

  /** А-5. Профиль на проверке: пополнять можно, выпускать карту нельзя. */
  profilePending: {
    ...BASE,
    id: 'profilePending',
    label: 'А-5. Профиль на проверке',
    profileStatus: 'PENDING',
    balance: '490.00',
    unallocated: '490.00',
    cards: [],
    operations: [FIRST_DEPOSIT],
  },

  /** А-6. Профиль застрял или отклонён. */
  profileStuck: {
    ...BASE,
    id: 'profileStuck',
    label: 'А-6. Профиль застрял',
    profileStatus: 'STUCK',
    balance: '490.00',
    unallocated: '490.00',
    cards: [],
    operations: [],
  },

  /** А-7. Пользователь заблокирован: всё на чтение, баланс виден. */
  blocked: {
    ...BASE,
    id: 'blocked',
    label: 'А-7. Пользователь заблокирован',
    profileStatus: 'BLOCKED',
    balance: '860.00',
    cards: [{ ...PRIMARY, available: '860.00', status: 'FROZEN', freezeReason: 'BY_OPERATOR' }],
    operations: SPEND_OPERATIONS,
  },

  /** А-8. Карантин 24 часа после привязки нового Telegram. */
  quarantine: {
    ...BASE,
    id: 'quarantine',
    label: 'А-8. Карантин после смены Telegram',
    quarantineUntil: '2026-10-06T14:30:00Z',
    balance: '1 240.00',
    cards: [PRIMARY, CHILD],
    operations: SPEND_OPERATIONS,
  },

  /** Б-8, Б-10. Баланс в минусе: все карты заморожены автоматически. */
  negative: {
    ...BASE,
    id: 'negative',
    label: 'Б-8. Баланс в минусе, карты заморожены',
    balance: '-23.40',
    shortfall: '23.40',
    cards: [
      { ...PRIMARY, available: '-23.40', status: 'FROZEN', freezeReason: 'NEGATIVE_BALANCE' },
      { ...CHILD, available: '0.00', status: 'FROZEN', freezeReason: 'NEGATIVE_BALANCE' },
    ],
    operations: SPEND_OPERATIONS,
  },

  /** Б-9. Карта заморожена самим пользователем. */
  frozenByUser: {
    ...BASE,
    id: 'frozenByUser',
    label: 'Б-9. Карта заморожена пользователем',
    balance: '1 240.00',
    cards: [{ ...PRIMARY, status: 'FROZEN', freezeReason: 'BY_USER' }, CHILD],
    operations: SPEND_OPERATIONS,
  },

  /** Б-11. Карта закрывается, ждём незакрытых авторизаций. */
  closing: {
    ...BASE,
    id: 'closing',
    label: 'Б-11. Карта закрывается, удержание',
    balance: '1 240.00',
    cards: [
      {
        ...PRIMARY,
        status: 'CLOSING',
        freezeReason: 'CLOSING',
        available: '0.00',
        held: '120.00',
        heldOperations: HELD_OPERATIONS,
      },
      { ...CHILD, available: '1 120.00' },
    ],
    operations: SPEND_OPERATIONS,
  },

  /** Б-13. Карта закрыта: ушла из активных, осталась в истории. */
  closed: {
    ...BASE,
    id: 'closed',
    label: 'Б-13. Карта закрыта',
    balance: '1 240.00',
    cards: [
      { ...CHILD, isPrimary: true, available: '1 240.00' },
      { ...PRIMARY, status: 'CANCELED', available: '0.00' },
    ],
    operations: SPEND_OPERATIONS,
  },

  /** В-1. Пул компании исчерпан. Пользователю — только «технические работы». */
  poolExhausted: {
    ...BASE,
    id: 'poolExhausted',
    label: 'В-1. Пул исчерпан, оплата недоступна',
    balance: '1 240.00',
    spendable: '0.00',
    spendableLimitedBy: 'pool',
    cards: [PRIMARY, CHILD],
    operations: SPEND_OPERATIONS,
  },

  /** В-3. Эмитент недоступен: показываем последние известные данные. */
  offline: {
    ...BASE,
    id: 'offline',
    label: 'В-3. Сервис недоступен',
    balance: '1 240.00',
    offlineSince: '2026-10-05T09:12:00Z',
    cards: [PRIMARY, CHILD],
    operations: SPEND_OPERATIONS,
  },
}

export const DEFAULT_SCENARIO = 'default'

export function getScenario(id: string): Scenario {
  return SCENARIOS[id] ?? SCENARIOS[DEFAULT_SCENARIO]!
}

/* --- Прочие демо-значения --------------------------------------------------- */

/* --- Уведомления --------------------------------------------------------------
   Лента уведомлений — то же самое, что приходит в бот. Хранится кодами и
   параметрами, а не готовым текстом: человек меняет язык, и вся лента
   обязана перечитаться на новом (CLAUDE.md, правило 3e).

   Исключение одно и оно видно ниже: причина отклонения заявки написана
   оператором от руки и хранится его текстом (docs/i18n.md).

   Порядок — от старых к новым, как в переписке. */

export const NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n-1',
    code: 'card.issued',
    params: { last4: '4417' },
    kind: 'card',
    at: '2026-10-03T19:40:00Z',
  },
  {
    id: 'n-2',
    code: 'deposit.credited',
    params: { amount: '490.00', currency: 'USD' },
    kind: 'money',
    at: '2026-10-04T09:12:00Z',
  },
  {
    id: 'n-3',
    code: 'challenge.code',
    params: { merchant: 'AMAZON MKTPL*2H4KL', amount: '49.99', currency: 'USD' },
    challengeCode: '4821',
    kind: 'challenge',
    at: '2026-10-04T20:10:00Z',
  },
  {
    id: 'n-4',
    code: 'spend.completed',
    params: { merchant: 'AMAZON MKTPL*2H4KL', amount: '49.99', currency: 'USD', last4: '4417' },
    kind: 'money',
    at: '2026-10-04T20:12:00Z',
  },
  {
    id: 'n-5',
    code: 'spend.declined',
    params: { merchant: 'UBER *TRIP HELP.UBER.C', amount: '23.40', currency: 'USD', last4: '8820' },
    reasonCode: 'insufficient_funds',
    kind: 'money',
    at: '2026-10-05T08:30:00Z',
  },
  {
    id: 'n-6',
    code: 'spend.completed',
    params: { merchant: 'SQ *COFFEE SHOP 4411', amount: '12.40', currency: 'USD', last4: '4417' },
    kind: 'money',
    at: '2026-10-05T10:45:00Z',
  },
  {
    id: 'n-7',
    code: 'deposit.rejected',
    // Причина — свободный текст оператора, хранится как написан.
    params: { reason: 'Платёж не найден по указанной ссылке.' },
    kind: 'money',
    at: '2026-10-05T12:20:00Z',
  },
  {
    id: 'n-8',
    code: 'transfer.completed',
    params: { amount: '200.00', currency: 'USD', from: '4417', to: '8820' },
    kind: 'money',
    at: '2026-10-05T13:41:00Z',
  },
  {
    id: 'n-9',
    code: 'card.frozen',
    params: { last4: '8820' },
    kind: 'card',
    at: '2026-10-05T18:05:00Z',
    unread: true,
  },
  /* Проверка не пройдена. Уведомление обязано быть: деньги на адрес
     пришли, но в систему не попали, и человек их не видит нигде. Молчание
     здесь читается как «деньги пропали». */
  {
    id: 'n-11',
    code: 'aml.failed',
    params: { amount: '1 200.00', currency: 'USDT' },
    actionCode: 'refund',
    kind: 'security',
    at: '2026-10-05T19:30:00Z',
    unread: true,
  },
  {
    id: 'n-10',
    code: 'challenge.code',
    params: { merchant: 'BOOKING.COM AMSTERDAM', amount: '180.00', currency: 'USD' },
    challengeCode: '3907',
    kind: 'challenge',
    at: '2026-10-06T09:15:00Z',
    unread: true,
  },
]

export const DEMO = {
  /** Невалидный по контрольной сумме номер — настоящих в прототипе нет. */
  pan: '5355 0100 2233 4417',
  cvv: '417',
  recoveryCode: 'RLM-7KQD-82XF-M4VT-9WAH',
  /** Вход по почте — для тех, у кого Telegram нет или кто открыл сайт
   *  с компьютера. Пароль в прототипе не проверяется: настоящего входа
   *  здесь нет (docs/prototype.md). */
  account: {
    email: 'd.sokolov@alpha-holding.ru',
    /** Подтверждена ли почта. На неё уходит восстановление доступа,
     *  поэтому состояние видно в настройках, а не прячется. */
    emailVerified: true,
    /** Бот, в который уводит вход через Telegram. Из браузера мы умеем
     *  только это: проверить наличие Telegram сайт не может. */
    bot: { name: '@reloom_bot', link: 'https://t.me/reloom_bot' },
  },
  /**
   * Возврат по непрошедшему проверку поступлению.
   *
   * Деньги лежат на крипто-адресе и в систему не зачислены — вернуть их
   * можно только туда, откуда пришли. Команду на возврат отдаёт сервис,
   * к которому подключён кошелёк; он же удерживает комиссию сети.
   *
   * Числа записаны готовыми: вычитание комиссии происходит на стороне
   * сервиса, и считать его у себя значило бы завести вторую, свою
   * арифметику над чужими деньгами (docs/prototype.md).
   */
  refund: {
    amount: '1 200.00',
    networkFee: '1.40',
    returned: '1 198.60',
    asset: 'USDT',
    network: 'Ethereum (ERC-20)',
    /** Адрес, с которого пришли деньги. Другого ввести нельзя. */
    from: '0x9D4eB2a7F31cA685b0E73d5C9f216aB84cD0E372',
    /** Адрес пополнения — после возврата он уничтожается. */
    address: '0x7F4c9A2bE81dC3650aF19b7D4e2C8a05B36fE914',
    risk: '91',
  },
  /** Второй фактор для входа по почте. Секрет выдуман, в QR он и уходит. */
  twoFactor: {
    secret: 'JBSW Y3DP EHPK 3PXP',
    otpauth: 'otpauth://totp/Reloom:d.sokolov@alpha-holding.ru?secret=JBSWY3DPEHPK3PXP&issuer=Reloom',
    code: '318204',
  },
  depositFee: { gross: '500.00', fee: '10.00', net: '490.00' },
  /** Ставка комиссии пополнения — показывается текстом, не считается. */
  depositRate: { percent: '1.5', fixed: '2.00' },
  minDeposit: '100.00',
  reviewHours: '6',
  secretsTimeout: 30,
  challenge: { code: '4821', amount: '49.99', merchant: 'AMAZON MKTPL*2H4KL', seconds: 272 },
  rejectReason: 'Платёж не найден по указанной ссылке.',
  /** Название устройства приходит как есть и не переводится. Подпись —
   *  код и параметр: иначе при смене языка история останется русской
   *  (docs/i18n.md). */
  sessions: [
    { id: 's1', title: 'iPhone 15 · Telegram', metaKey: 'settings.sessions.current' },
    {
      id: 's2',
      title: 'Windows · Telegram Desktop',
      metaKey: 'settings.sessions.lastSeen',
      metaDate: '2026-10-03T19:40:00Z',
    },
  ],
}

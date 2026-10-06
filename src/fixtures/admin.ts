/**
 * Демо-данные админки.
 *
 * ПРАВИЛО ЭТАПА: здесь нет ни одной арифметической операции над деньгами
 * (docs/prototype.md). Конкретно это значит:
 *
 * - Сто пользователей не считаются, а раскладываются: имена, компании и
 *   суммы берутся из заранее написанных наборов по кругу. Выбор элемента
 *   из списка — не вычисление.
 * - Сводные числа компании (пул, выдано остатков, запас, покрытие) записаны
 *   руками по каждой компании. Они НЕ суммируются по пользователям: сумма
 *   остатков — это денежный расчёт, он появится на этапе 1 вместе с
 *   леджером и тестами.
 * - Поэтому сводка и список пользователей намеренно не сходятся копейка
 *   в копейку. Это демо-данные для проверки вёрстки на объёме, а не
 *   отчётность.
 *
 * Списки должны проверяться на объёме: сто строк, а не три. Красивые
 * круглые суммы и короткий список скрывают проблемы вёрстки.
 */

import type { Money } from './types'

/* --- Компании --------------------------------------------------------------
   У каждой компании свой cl_… в Oxen и свой пул. Пул одной компании не
   покрывает карты другой, поэтому покрытие считается в разрезе компании. */

export type CoverageState = 'ok' | 'warn20' | 'warn15' | 'urgent10' | 'critical'

export interface Company {
  id: string
  name: string
  oxenClientId: string
  /** Пул залога в Oxen — наш оборотный капитал, не деньги пользователей. */
  pool: Money
  /** Сумма остатков по всем картам пользователей компании. */
  issued: Money
  /** Пул минус остатки. */
  headroom: Money
  /** Покрытие в процентах, готовой строкой. */
  coverage: string
  coverageState: CoverageState
  depositAddress: string
  isActive: boolean
}

export const COMPANIES: Company[] = [
  {
    id: 'alpha',
    name: 'Holding Alpha',
    oxenClientId: 'cl_7KQD82XFM4VT',
    pool: '248 000.00',
    issued: '196 420.00',
    headroom: '51 580.00',
    coverage: '26.3',
    coverageState: 'ok',
    depositAddress: 'TQ5nR8vK2mXpL7dYwF3jH9cB4tZaS6eNqU',
    isActive: true,
  },
  {
    id: 'beta',
    name: 'Holding Beta',
    oxenClientId: 'cl_9WAH31PLQ8ZR',
    pool: '92 500.00',
    issued: '82 140.00',
    headroom: '10 360.00',
    coverage: '12.6',
    coverageState: 'urgent10',
    depositAddress: '0x7F4c9A2bE81dC3650aF19b7D4e2C8a05B36fE914',
    isActive: true,
  },
  {
    id: 'gamma',
    name: 'Holding Gamma',
    oxenClientId: 'cl_2H4KL6BNX0TY',
    pool: '41 000.00',
    issued: '36 180.00',
    headroom: '4 820.00',
    coverage: '13.3',
    coverageState: 'warn15',
    depositAddress: '0x3A9dE1c47B20fF8562aD93c1E7b045F8cA216D73',
    isActive: true,
  },
  {
    id: 'delta',
    name: 'Holding Delta',
    oxenClientId: 'cl_5ZVM9CJ3QW8E',
    pool: '18 400.00',
    issued: '19 760.00',
    /* Отрицательный запас — критическое состояние: Oxen проверяет пул
       раньше лимита карты, и карты начнут отказывать в случайном порядке. */
    headroom: '-1 360.00',
    coverage: '-6.9',
    coverageState: 'critical',
    depositAddress: 'UQD2k7bXnLmR4vP9cJ8tY6wE3aZqH5fN1gVxMcB7dKuT',
    isActive: true,
  },
]

/* --- Пользователи ----------------------------------------------------------- */

export type UserStatus = 'ACTIVE' | 'BLOCKED'
/** Статус картхолдера у эмитента. NEEDS_* разрешается только обращением
 *  к их менеджеру — у нас роутов обновления картхолдера нет. */
export type OxenStatus = 'APPROVED' | 'PENDING' | 'NEEDS_REVIEW' | 'REJECTED' | null

export interface AdminUser {
  id: string
  name: string
  companyId: string
  status: UserStatus
  oxenStatus: OxenStatus
  balance: Money
  /** Отрицательный баланс: все карты заморожены автоматически. */
  negative: boolean
  cards: number
  primaryLast4: string | null
  childLast4: string | null
  email: string
  telegram: string | null
  /** Нераспределённый остаток. В норме ноль. */
  unallocated: Money
  /** Сводка по деньгам в карточке пользователя. Все значения написаны
   *  руками и выбираются из набора: это не итоги по леджеру, а демо-данные
   *  для вёрстки. Настоящие суммы появятся на этапе 1. */
  money: {
    deposited: Money
    spent: Money
    fees: Money
    withdrawn: Money
  }
  createdAt: string
}

/* Имена и фамилии согласованы по роду: выбираются парами из своего
   набора. Независимые пулы давали «Фёдорова Павел», а это бросается
   в глаза на показе. */
const MALE_NAMES = [
  'Сергей', 'Дмитрий', 'Иван', 'Алексей', 'Павел', 'Андрей', 'Михаил',
  'Роман', 'Артём', 'Николай',
]

const MALE_SURNAMES = [
  'Иванов', 'Козлов', 'Волков', 'Морозов', 'Новиков', 'Орлов', 'Киселёв',
  'Зайцев', 'Тарасов', 'Богданов', 'Егоров', 'Дьячков', 'Панов', 'Смирнов',
  'Фёдоров',
]

const FEMALE_NAMES = [
  'Анна', 'Ольга', 'Мария', 'Екатерина', 'Наталья', 'Татьяна', 'Елена',
  'Юлия', 'Светлана', 'Ирина',
]

const FEMALE_SURNAMES = [
  'Петрова', 'Смирнова', 'Соколова', 'Лебедева', 'Фёдорова', 'Гусева',
  'Макарова', 'Беляева', 'Крылова', 'Сорокина', 'Титова', 'Ушакова',
  'Волкова', 'Орлова', 'Зайцева',
]

/** Заранее написанные суммы. Выбираются по кругу — не вычисляются. */
const BALANCES: Money[] = [
  '1 240.00', '0.00', '860.00', '4 312.50', '120.40', '15 800.00', '2 005.75',
  '47.20', '9 430.00', '318.60', '0.00', '12 750.00', '640.15', '3 090.00',
  '75 200.00', '1 999.99', '208.00', '5 614.30', '88.80', '27 340.00',
  '1 450.00', '390.25', '6 780.00', '11.05', '2 860.70',
]

const NEGATIVE_BALANCES: Money[] = ['-23.40', '-112.80', '-4.15', '-67.00']

const DEPOSITED: Money[] = [
  '2 940.00', '0.00', '1 470.00', '6 800.00', '480.00', '22 000.00', '3 150.00',
  '300.00', '12 600.00', '900.00',
]
const SPENT: Money[] = [
  '1 700.00', '0.00', '610.00', '2 487.50', '359.60', '6 200.00', '1 144.25',
  '252.80', '3 170.00', '581.40',
]
const FEES_COLLECTED: Money[] = [
  '44.10', '0.00', '22.05', '102.00', '7.20', '330.00', '47.25', '4.50', '189.00', '13.50',
]
const WITHDRAWN: Money[] = [
  '0.00', '0.00', '0.00', '300.00', '0.00', '0.00', '0.00', '0.00', '1 000.00', '0.00',
]

const LAST4 = [
  '4417', '9032', '1180', '7265', '3391', '5508', '2247', '6673', '8814', '0956',
  '3302', '7741', '1628', '9087', '4453', '2219', '6690', '5136', '8472', '0318',
]

function pick<T>(list: T[], index: number): T {
  return list[index % list.length]!
}

/**
 * Сто пользователей. Генерация детерминированная: один и тот же индекс
 * всегда даёт того же человека, поэтому ссылки на карточку не протухают
 * между перезагрузками.
 */
function buildUsers(): AdminUser[] {
  const users: AdminUser[] = []

  for (let i = 0; i < 100; i += 1) {
    const female = i % 2 === 1
    const first = female ? pick(FEMALE_NAMES, i) : pick(MALE_NAMES, i)
    const last = female ? pick(FEMALE_SURNAMES, i * 7 + 3) : pick(MALE_SURNAMES, i * 7 + 3)
    const company = pick(COMPANIES, i * 3 + 1)

    // Раскладка состояний: заблокированные, непрошедшие проверку,
    // застрявшие и минусовые должны встречаться в списке, а не только
    // в счастливом пути.
    const blocked = i % 17 === 5
    const negative = !blocked && i % 23 === 9
    const oxenStatus: OxenStatus = blocked
      ? 'APPROVED'
      : i % 19 === 3
        ? 'PENDING'
        : i % 29 === 11
          ? 'NEEDS_REVIEW'
          : i % 31 === 17
            ? null
            : 'APPROVED'

    const noCards = oxenStatus === 'PENDING' || oxenStatus === null || i % 13 === 7
    const twoCards = !noCards && i % 3 !== 2

    users.push({
      id: `usr-${String(i + 1).padStart(3, '0')}`,
      name: `${last} ${first}`,
      companyId: company.id,
      status: blocked ? 'BLOCKED' : 'ACTIVE',
      oxenStatus,
      balance: negative ? pick(NEGATIVE_BALANCES, i) : pick(BALANCES, i * 5 + 2),
      negative,
      cards: noCards ? 0 : twoCards ? 2 : 1,
      primaryLast4: noCards ? null : pick(LAST4, i),
      childLast4: twoCards ? pick(LAST4, i * 3 + 11) : null,
      email: `user${i + 1}@reloom.example`,
      telegram: noCards && oxenStatus === null ? null : `@user_${i + 1}`,
      unallocated: noCards && !negative ? pick(BALANCES, i * 5 + 2) : '0.00',
      money: {
        deposited: pick(DEPOSITED, i),
        spent: pick(SPENT, i),
        fees: pick(FEES_COLLECTED, i),
        withdrawn: pick(WITHDRAWN, i),
      },
      createdAt: `2026-0${(i % 9) + 1}-${String((i % 27) + 1).padStart(2, '0')}T10:00:00Z`,
    })
  }

  return users
}

export const USERS: AdminUser[] = buildUsers()

/* --- Заявки на пополнение ---------------------------------------------------
   Основная ежедневная работа оператора. Старые сверху: заявка, висящая
   сутки, должна быть первой. */

export interface AdminDeposit {
  id: string
  userId: string
  userName: string
  companyId: string
  declared: Money
  network: string
  asset: string
  /** Ссылка необязательна, но без неё проверка дольше — строка помечается. */
  txLink: string | null
  status: 'SUBMITTED' | 'CREDITED' | 'REJECTED'
  createdAt: string
  /** Фактически полученная сумма — заполняется оператором при подтверждении. */
  received?: Money
  /** Удержание и нетто для ЭТОЙ суммы, написанные заранее. Нужны, чтобы
   *  расчёт в окне подтверждения сходился с заявленной суммой: общий
   *  пример на другую сумму выглядит как ошибка. Настоящий расчёт
   *  появится на этапе 1. */
  fee: Money
  net: Money
  rejectReasonCode?: string
}

/* Суммы заявок и соответствующее им удержание по глобальной ставке
   150 б.п. + 2.00 USD. Записаны парами и заранее — в коде не считаются. */
const DEPOSIT_FIGURES: { declared: Money; fee: Money; net: Money }[] = [
  { declared: '500.00', fee: '9.50', net: '490.50' },
  { declared: '1 200.00', fee: '20.00', net: '1 180.00' },
  { declared: '75.00', fee: '3.13', net: '71.87' },
  { declared: '10 000.00', fee: '152.00', net: '9 848.00' },
  { declared: '250.50', fee: '5.76', net: '244.74' },
  { declared: '3 400.00', fee: '53.00', net: '3 347.00' },
  { declared: '98.20', fee: '3.47', net: '94.73' },
  { declared: '620.00', fee: '11.30', net: '608.70' },
  { declared: '15 000.00', fee: '227.00', net: '14 773.00' },
  { declared: '180.00', fee: '4.70', net: '175.30' },
  { declared: '2 750.00', fee: '43.25', net: '2 706.75' },
  { declared: '45.00', fee: '2.68', net: '42.32' },
]

export const DEPOSITS: AdminDeposit[] = Array.from({ length: 14 }, (_, i) => {
  const user = pick(USERS, i * 7 + 2)
  const figures = pick(DEPOSIT_FIGURES, i)
  return {
    id: `dep-${String(i + 1).padStart(3, '0')}`,
    userId: user.id,
    userName: user.name,
    companyId: user.companyId,
    declared: figures.declared,
    fee: figures.fee,
    net: figures.net,
    network: pick(['Tron (TRC-20)', 'Ethereum (ERC-20)', 'TON', 'BNB Smart Chain (BEP-20)'], i),
    asset: i % 5 === 3 ? 'USDC' : 'USDT',
    txLink: i % 4 === 1 ? null : `https://tronscan.org/#/transaction/9f2c${i}a7b4e`,
    status: 'SUBMITTED',
    createdAt: `2026-10-0${(i % 5) + 1}T${String(8 + (i % 10)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00Z`,
  }
})

/* --- Карты ------------------------------------------------------------------ */

export interface AdminCard {
  id: string
  last4: string
  userId: string
  userName: string
  companyId: string
  isPrimary: boolean
  status: 'ACTIVE' | 'FROZEN' | 'CLOSING' | 'CANCELED'
  freezeReason: string | null
  /** Подтверждённый Oxen потолок. */
  applied: Money
  spent: Money
  available: Money
  /** Удерживается по незакрытым авторизациям при закрытии. */
  held: Money | null
  expires: string
}

const CARD_FIGURES: { applied: Money; spent: Money; available: Money }[] = [
  { applied: '1 000.00', spent: '180.00', available: '820.00' },
  { applied: '480.00', spent: '60.00', available: '420.00' },
  { applied: '5 000.00', spent: '687.50', available: '4 312.50' },
  { applied: '300.00', spent: '179.60', available: '120.40' },
  { applied: '16 000.00', spent: '200.00', available: '15 800.00' },
  { applied: '2 200.00', spent: '194.25', available: '2 005.75' },
  { applied: '120.00', spent: '72.80', available: '47.20' },
  { applied: '9 800.00', spent: '370.00', available: '9 430.00' },
]

export const CARDS: AdminCard[] = USERS.flatMap((user, i) => {
  const out: AdminCard[] = []
  if (user.cards === 0) return out

  const frozenByNegative = user.negative
  const closing = i % 37 === 12
  const figures = pick(CARD_FIGURES, i)

  out.push({
    id: `card-${user.id}-p`,
    last4: user.primaryLast4!,
    userId: user.id,
    userName: user.name,
    companyId: user.companyId,
    isPrimary: true,
    status: closing ? 'CLOSING' : frozenByNegative ? 'FROZEN' : user.status === 'BLOCKED' ? 'FROZEN' : 'ACTIVE',
    freezeReason: closing
      ? 'CLOSING'
      : frozenByNegative
        ? 'NEGATIVE_BALANCE'
        : user.status === 'BLOCKED'
          ? 'BY_OPERATOR'
          : null,
    applied: figures.applied,
    spent: figures.spent,
    available: closing ? '0.00' : figures.available,
    held: closing ? '120.00' : null,
    expires: '09/29',
  })

  if (user.cards === 2) {
    const childFigures = pick(CARD_FIGURES, i * 3 + 5)
    out.push({
      id: `card-${user.id}-c`,
      last4: user.childLast4!,
      userId: user.id,
      userName: user.name,
      companyId: user.companyId,
      isPrimary: false,
      status: frozenByNegative || user.status === 'BLOCKED' ? 'FROZEN' : 'ACTIVE',
      freezeReason: frozenByNegative
        ? 'NEGATIVE_BALANCE'
        : user.status === 'BLOCKED'
          ? 'BY_OPERATOR'
          : null,
      applied: childFigures.applied,
      spent: childFigures.spent,
      available: childFigures.available,
      held: null,
      expires: '11/29',
    })
  }

  return out
})

/* --- Транзакции -------------------------------------------------------------
   Названия мерчантов приходят сырыми и не переводятся никогда. */

export type Anomaly = 'OVER_AUTH' | 'FORCE_POSTED' | 'NO_AUTH'

export interface AdminTransaction {
  id: string
  at: string
  userId: string
  userName: string
  companyId: string
  cardLast4: string
  merchant: string
  amount: Money
  currency: string
  localAmount: Money | null
  localCurrency: string | null
  status: 'pending' | 'completed' | 'declined' | 'refund' | 'reversed'
  declineReasonCode: string | null
  anomaly: Anomaly | null
}

const MERCHANTS = [
  'SQ *COFFEE SHOP 4411', 'AMAZON MKTPL*2H4KL', 'CARREFOUR CITY 0391',
  'HOTEL ARTEMIDE ROMA', 'UBER *TRIP', 'STEAM PURCHASE', 'ZARA ES 2281',
  'BOOKING.COM AMSTERDAM', 'YANDEX TAXI', 'APPLE.COM/BILL', 'IKEA LISBOA',
  'SP *NOTION LABS', 'LIDL SAGT 1142', 'SNCF INTERNET', 'GITHUB.COM',
]

/* Траты всегда с минусом, возвраты всегда с плюсом. Независимый выбор
   суммы и статуса давал «возврат −1 240.00», а это читается как ошибка. */
const SPEND_AMOUNTS: Money[] = [
  '-12.40', '-49.99', '-112.40', '-248.60', '-18.00', '-24.99', '-310.00',
  '-8.15', '-99.00', '-1 240.00', '-3.50', '-560.00', '-76.42',
]

const REFUND_AMOUNTS: Money[] = ['+107.30', '+49.99', '+18.00', '+230.00']

export const TRANSACTIONS: AdminTransaction[] = Array.from({ length: 120 }, (_, i) => {
  const card = pick(CARDS, i * 5 + 3)
  const declined = i % 11 === 4
  const anomaly: Anomaly | null =
    i % 29 === 7 ? 'OVER_AUTH' : i % 43 === 19 ? 'FORCE_POSTED' : i % 53 === 31 ? 'NO_AUTH' : null
  const foreign = i % 6 === 2

  const status = declined
    ? ('declined' as const)
    : i % 9 === 3
      ? ('pending' as const)
      : i % 17 === 8
        ? ('refund' as const)
        : ('completed' as const)

  return {
    id: `tx-${String(i + 1).padStart(4, '0')}`,
    at: `2026-10-0${(i % 5) + 1}T${String(7 + (i % 15)).padStart(2, '0')}:${String((i * 11) % 60).padStart(2, '0')}:00Z`,
    userId: card.userId,
    userName: card.userName,
    companyId: card.companyId,
    cardLast4: card.last4,
    merchant: pick(MERCHANTS, i),
    amount: status === 'refund' ? pick(REFUND_AMOUNTS, i) : pick(SPEND_AMOUNTS, i * 3),
    currency: 'USD',
    localAmount: foreign ? pick(['100.00', '226.00', '45.90', '1 200.00'], i) : null,
    localCurrency: foreign ? pick(['EUR', 'GBP', 'JPY', 'CHF'], i) : null,
    status,
    declineReasonCode: declined
      ? pick(['insufficient_funds', 'card_frozen', 'do_not_honor', 'account_credit_limit_exceeded'], i)
      : null,
    anomaly,
  }
})

/* --- Операторы ---------------------------------------------------------------
   Права разграничены. Главный администратор единственный изначально имеет
   GRANT_RIGHTS; оператор с MANAGE_USERS выдавать права не может. */

export const RIGHTS = [
  'MANAGE_USERS',
  'APPROVE_DEPOSITS',
  'WITHDRAW',
  'ADJUST_BALANCE',
  'MANAGE_SETTINGS',
  /* Адреса выделены из общих настроек: ошибка в адресе означает деньги,
     ушедшие в никуда, а комиссию или название сети можно поправить. */
  'MANAGE_ADDRESSES',
  'GRANT_RIGHTS',
] as const

export type Right = (typeof RIGHTS)[number]

export interface Operator {
  id: string
  name: string
  email: string
  rights: Right[]
  isSuperAdmin: boolean
  isActive: boolean
  /** Настроен ли второй фактор. Пока нет, оператор обязан настроить его
      при первом входе: админка двигает чужие деньги. */
  twoFactorEnabled: boolean
}

export const OPERATORS: Operator[] = [
  {
    id: 'op-1',
    name: 'Главный администратор',
    email: 'admin@reloom.example',
    rights: [...RIGHTS],
    isSuperAdmin: true,
    isActive: true,
    twoFactorEnabled: true,
  },
  {
    id: 'op-2',
    name: 'Ковалёва Марина',
    email: 'm.kovaleva@reloom.example',
    rights: ['MANAGE_USERS', 'APPROVE_DEPOSITS'],
    isSuperAdmin: false,
    isActive: true,
    twoFactorEnabled: true,
  },
  {
    id: 'op-3',
    name: 'Шевченко Артём',
    email: 'a.shevchenko@reloom.example',
    rights: ['APPROVE_DEPOSITS', 'WITHDRAW', 'ADJUST_BALANCE', 'MANAGE_ADDRESSES'],
    isSuperAdmin: false,
    isActive: true,
    twoFactorEnabled: true,
  },
  {
    id: 'op-4',
    name: 'Лаврова Полина',
    email: 'p.lavrova@reloom.example',
    rights: ['MANAGE_SETTINGS'],
    isSuperAdmin: false,
    isActive: false,
    twoFactorEnabled: true,
  },
  /* Заведён недавно и в журнале аудита ещё не встречается. На нём видно
     разницу: запись без следов в аудите удаляется, запись со следами —
     только отключается. */
  {
    id: 'op-5',
    name: 'Белов Денис',
    email: 'd.belov@reloom.example',
    rights: ['APPROVE_DEPOSITS'],
    isSuperAdmin: false,
    isActive: true,
    twoFactorEnabled: false,
  },
]

/** Операторы, чьи действия попали в журнал. */
const AUDIT_OPERATORS = OPERATORS.filter((o) => o.id !== 'op-5')

/** Оператор, под которым открыта админка в прототипе. */
export const CURRENT_OPERATOR = OPERATORS[0]!

/* --- Настройки --------------------------------------------------------------- */

export const FEES = {
  deposit: { bps: '150', fixed: '2.00', min: '2.00' },
  withdrawal: { bps: '100', fixed: '5.00', min: '5.00' },
  /** Индивидуальная ставка ЗАМЕНЯЕТ глобальную, а не складывается с ней. */
  overrides: [
    { userId: 'usr-004', userName: USERS[3]!.name, deposit: '50', withdrawal: null },
    { userId: 'usr-021', userName: USERS[20]!.name, deposit: null, withdrawal: '0' },
    { userId: 'usr-057', userName: USERS[56]!.name, deposit: '0', withdrawal: '0' },
  ],
  minDeposit: '100.00',
  minWithdrawal: '100.00',
  /** Готовый пример расчёта для калькулятора-превью: ничего не считается. */
  preview: { gross: '1 000.00', fee: '17.00', net: '983.00' },
}

export interface NetworkAddress {
  id: string
  address: string
  memo: string | null
  label: string | null
  isActive: boolean
  /** Сколько заявок на пополнение ссылается на адрес. Число записано
      руками: считать его в прототипе нечем и незачем. Адрес со ссылками
      удалить нельзя — иначе прошлые заявки перестанут объясняться. */
  usedInDeposits: number
}

export interface AdminNetwork {
  id: string
  name: string
  asset: string
  requiresMemo: boolean
  isActive: boolean
  /** Иконка монеты. Загружается оператором; в прототипе файлов нет,
      и на её месте кружок с тикером того же размера. */
  iconUrl: string | null
  addresses: NetworkAddress[]
}

export const NETWORKS: AdminNetwork[] = [
  {
    id: 'trc20',
    name: 'Tron (TRC-20)',
    asset: 'USDT',
    requiresMemo: false,
    isActive: true,
    iconUrl: null,
    addresses: [
      {
        id: 'a1',
        address: 'TQ5nR8vK2mXpL7dYwF3jH9cB4tZaS6eNqU',
        memo: null,
        label: 'Основной',
        isActive: true,
        usedInDeposits: 9,
      },
      {
        id: 'a2',
        address: 'TJd4nQ8mF2xV6pK1wR7yH3cB9tZaS5eNqL',
        memo: null,
        label: 'Резервный',
        isActive: false,
        usedInDeposits: 0,
      },
    ],
  },
  {
    id: 'erc20',
    name: 'Ethereum (ERC-20)',
    asset: 'USDT',
    requiresMemo: false,
    isActive: true,
    iconUrl: null,
    addresses: [
      {
        id: 'a3',
        address: '0x7F4c9A2bE81dC3650aF19b7D4e2C8a05B36fE914',
        memo: null,
        label: 'Основной',
        isActive: true,
        usedInDeposits: 3,
      },
    ],
  },
  {
    id: 'ton',
    name: 'TON',
    asset: 'USDT',
    requiresMemo: true,
    isActive: true,
    iconUrl: null,
    addresses: [
      {
        id: 'a4',
        address: 'UQD2k7bXnLmR4vP9cJ8tY6wE3aZqH5fN1gVxMcB7dKuT',
        memo: '48201937',
        label: 'Основной',
        isActive: true,
        usedInDeposits: 2,
      },
    ],
  },
  {
    id: 'bep20',
    name: 'BNB Smart Chain (BEP-20)',
    asset: 'USDC',
    requiresMemo: false,
    isActive: false,
    iconUrl: null,
    addresses: [],
  },
]

/** Монеты, доступные при заведении адреса. Список закрытый: монета,
    которой нет у эмитента, зачислена не будет. */
export const ASSETS = ['USDT', 'USDC'] as const

/* --- Состояние системы и аудит ----------------------------------------------- */

export const SYSTEM = {
  eventLagSeconds: '14',
  unprocessedEvents: '3',
  lastPoolRead: '2026-10-05T14:02:00Z',
  pendingTransfers: [
    { id: 'tr-1', userName: USERS[12]!.name, amount: '200.00', state: 'SOURCE_REDUCED', at: '2026-10-05T13:41:00Z' },
    { id: 'tr-2', userName: USERS[48]!.name, amount: '1 500.00', state: 'PENDING', at: '2026-10-05T12:08:00Z' },
  ],
  stuckCalls: [
    { id: 'sc-1', action: 'POST /cardholders/:id/cards', requestId: 'req_8KQ2M4VT9WAH', at: '2026-10-05T11:55:00Z' },
  ],
  errors: [
    { id: 'e-1', code: '502 PROVIDER_AMBIGUOUS', requestId: 'req_3PLQ8ZR5ZVM9', at: '2026-10-05T10:12:00Z' },
    { id: 'e-2', code: '429 PROVIDER_RATE_LIMITED', requestId: 'req_7XFM4VT9WAH3', at: '2026-10-05T09:48:00Z' },
  ],
  /* Названия сверок и их итог — кодами: текст собирается при показе,
     на языке читателя (CLAUDE.md, правило 3e). */
  reconciliation: [
    { id: 'r-1', code: 'ledgerMirror', ok: true },
    { id: 'r-2', code: 'balancesPools', ok: false },
  ],
  throttling: false,
}

export interface AuditEntry {
  id: string
  at: string
  operator: string
  /** Код действия, не текст: переводится при показе. */
  actionCode: string
  /** Код типа объекта: заявка, пользователь, оператор, карта. */
  targetTypeCode: string
  /** Имя объекта — данные, их не переводят. */
  target: string
  companyId: string
  reasonCode: string | null
  highlight: boolean
}

export const AUDIT: AuditEntry[] = Array.from({ length: 60 }, (_, i) => {
  // Через pick, а не по голому индексу: 60 записей на 100 пользователях
  // с шагом 3 уходят за границу массива, и `!` это молча пропускает.
  const user = pick(USERS, i * 3 + 5)
  const kind = i % 7
  /* Действие, объект и причина хранятся КОДАМИ, а не готовым текстом
     (CLAUDE.md, правило 3e): иначе смена языка не перечитывает историю,
     и оператор с пользователем не могут увидеть одно событие каждый на
     своём языке. В текст они превращаются при показе. */
  const actions = [
    { action: 'depositApproved', type: 'deposit', highlight: false },
    { action: 'balanceAdjusted', type: 'user', highlight: true },
    { action: 'withdrawal', type: 'user', highlight: true },
    { action: 'userBlocked', type: 'user', highlight: false },
    { action: 'rightsChanged', type: 'operator', highlight: true },
    { action: 'feeOverridden', type: 'user', highlight: true },
    { action: 'cardFrozen', type: 'card', highlight: false },
  ]
  const entry = actions[kind]!

  return {
    id: `aud-${String(i + 1).padStart(3, '0')}`,
    at: `2026-10-0${(i % 5) + 1}T${String(8 + (i % 12)).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}:00Z`,
    operator: pick(AUDIT_OPERATORS, i).name,
    actionCode: entry.action,
    targetTypeCode: entry.type,
    target: user.name,
    companyId: user.companyId,
    reasonCode: entry.highlight ? 'userRequest' : null,
    highlight: entry.highlight,
  }
})

/* --- Журнал обмена с эмитентом ------------------------------------------------
   Каждый запрос к Oxen и каждое принятое событие. Нужен для разбора: их API
   менялся ломающими изменениями еженедельно, и без собственной записи
   «что мы отправили и что получили» разбирать нечего — у них свой лог, у нас
   свой, сходятся они по requestId.

   Тела показаны УЖЕ ВЫЧИЩЕННЫМИ. Номер карты, CVV, PIN и ключи доступа
   в журнал не попадают никогда и ни в каком виде (CLAUDE.md, docs/security.md):
   вычистка происходит до записи, а не при показе. */

export type ExchangeDirection = 'out' | 'in'
export type ExchangeOutcome = 'ok' | 'retried' | 'failed'

export interface ExchangeEntry {
  id: string
  at: string
  direction: ExchangeDirection
  /** Для исходящих — метод и путь. Для входящих — тип события. */
  method: string
  path: string
  /** Код ответа. У входящих событий его нет: это уведомление, а не запрос. */
  status: string | null
  durationMs: string
  requestId: string
  companyId: string
  outcome: ExchangeOutcome
  /** Что отправили. У входящих пусто. */
  request: string | null
  /** Что получили. Уже без секретов. */
  response: string
  /** Код разбора: почему запись помечена. Пусто, если всё прошло штатно. */
  noteCode: string | null
}

const OUTGOING = [
  { method: 'POST', path: '/cardholders', status: '201', outcome: 'ok' as ExchangeOutcome },
  { method: 'POST', path: '/cards', status: '201', outcome: 'ok' as ExchangeOutcome },
  { method: 'PUT', path: '/cards/:id/limit', status: '200', outcome: 'ok' as ExchangeOutcome },
  { method: 'GET', path: '/clients/:id/collateral', status: '200', outcome: 'ok' as ExchangeOutcome },
  { method: 'GET', path: '/events', status: '200', outcome: 'ok' as ExchangeOutcome },
  { method: 'PUT', path: '/cards/:id/limit', status: '409', outcome: 'retried' as ExchangeOutcome },
  { method: 'GET', path: '/clients/:id/collateral', status: '401', outcome: 'failed' as ExchangeOutcome },
  { method: 'POST', path: '/cards', status: '502', outcome: 'failed' as ExchangeOutcome },
]

const INCOMING = [
  { method: 'EVENT', path: 'transaction.created', outcome: 'ok' as ExchangeOutcome },
  { method: 'EVENT', path: 'transaction.updated', outcome: 'ok' as ExchangeOutcome },
  { method: 'EVENT', path: 'card.status.changed', outcome: 'ok' as ExchangeOutcome },
  { method: 'EVENT', path: 'cardholder.kyc.updated', outcome: 'ok' as ExchangeOutcome },
  { method: 'EVENT', path: 'transaction.created', outcome: 'retried' as ExchangeOutcome },
]

/** Коды ответов, у которых есть разбор. Сам разбор — в словаре. */
const NOTED_STATUSES = ['409', '401', '502']

/** Тело запроса под конкретный вызов: у чтения залога и у выпуска карты
    они разные, и одинаковое тело на всех строках выглядело бы подделкой. */
function requestBody(path: string, user: AdminUser, i: number): string | null {
  const clientId = companyById(user.companyId)?.oxenClientId ?? 'cl_…'

  if (path === '/clients/:id/collateral' || path === '/events') {
    // У чтения тела нет — только параметры строки запроса.
    return null
  }

  if (path === '/cardholders') {
    return JSON.stringify(
      {
        clientId,
        externalId: user.id,
        fullName: user.name,
        email: user.email,
        idempotencyKey: `idem_${user.id}_holder`,
      },
      null,
      2,
    )
  }

  if (path === '/cards') {
    return JSON.stringify(
      {
        clientId,
        cardholderId: `ch_${user.id.slice(4)}`,
        type: 'VIRTUAL',
        currency: 'USD',
        idempotencyKey: `idem_${user.id}_card_${i}`,
      },
      null,
      2,
    )
  }

  // PUT /cards/:id/limit — накопительный лимит принимает АБСОЛЮТНОЕ значение:
  // потолок, а не прибавку (docs/domain-and-money.md).
  return JSON.stringify(
    {
      type: 'ALL_TIME',
      amount: pick(['500.00', '1 200.00', '2 400.00'], i),
      idempotencyKey: `idem_${user.id}_limit_${i}`,
    },
    null,
    2,
  )
}

/** Тело ответа под конкретный вызов. Номер карты и CVV показаны
    замаскированными не на экране, а в самой записи: в открытом виде они
    на наш сервер не попадают (CLAUDE.md, docs/security.md). */
function responseBody(path: string, user: AdminUser, i: number, eventType?: string): string {
  const last4 = pick(['4453', '2247', '3302', '9087'], i)

  if (path === 'EVENT') {
    const id = `evt_${String(i + 1).padStart(4, '0')}`
    const at = `2026-10-0${(i % 5) + 1}T10:00:00Z`

    // Событие — уведомление, а не запись: его тело лишь говорит, что
    // перечитать. Поэтому у разных типов оно разное.
    if (eventType === 'card.status.changed') {
      return JSON.stringify(
        {
          id,
          type: eventType,
          cardId: `crd_${user.id.slice(4)}`,
          status: pick(['FROZEN', 'ACTIVE', 'CANCELED'], i),
          occurredAt: at,
        },
        null,
        2,
      )
    }

    if (eventType === 'cardholder.kyc.updated') {
      return JSON.stringify(
        {
          id,
          type: eventType,
          cardholderId: `ch_${user.id.slice(4)}`,
          kycStatus: pick(['APPROVED', 'NEEDS_REVIEW', 'REJECTED'], i),
          occurredAt: at,
        },
        null,
        2,
      )
    }

    return JSON.stringify(
      {
        id,
        type: eventType ?? 'transaction.created',
        cardId: `crd_${user.id.slice(4)}`,
        pan: `**** **** **** ${last4}`,
        amount: pick(['12.40', '248.60', '99.00', '1 240.00'], i),
        currency: 'USD',
        occurredAt: at,
      },
      null,
      2,
    )
  }

  if (path === '/clients/:id/collateral') {
    return JSON.stringify(
      {
        clientId: companyById(user.companyId)?.oxenClientId ?? 'cl_…',
        collateral: companyById(user.companyId)?.pool ?? '0.00',
        currency: 'USD',
      },
      null,
      2,
    )
  }

  if (path === '/cardholders') {
    return JSON.stringify(
      { id: `ch_${user.id.slice(4)}`, kycStatus: 'PENDING', externalId: user.id },
      null,
      2,
    )
  }

  if (path === '/events') {
    return JSON.stringify({ items: pick(['3', '7', '0', '12'], i), hasMore: false }, null, 2)
  }

  if (path === '/cards') {
    return JSON.stringify(
      {
        id: `crd_${user.id.slice(4)}`,
        status: 'ACTIVE',
        pan: `**** **** **** ${last4}`,
        cvv: '***',
        expiry: '09/29',
      },
      null,
      2,
    )
  }

  // PUT /cards/:id/limit — возвращается применённый потолок и счётчик
  // потраченного. Потолок при тратах не уменьшается.
  return JSON.stringify(
    {
      id: `crd_${user.id.slice(4)}`,
      appliedLimit: pick(['500.00', '1 200.00', '2 400.00'], i),
      spent: pick(['180.00', '194.25', '0.00'], i),
      window: 'ALL_TIME',
    },
    null,
    2,
  )
}

/** Журнал обмена. Строки разложены по кругу, суммы в телах — готовые
    строки из тех же демо-данных. Ничего не вычисляется. */
export const EXCHANGE_LOG: ExchangeEntry[] = Array.from({ length: 48 }, (_, i) => {
  const outgoing = i % 3 !== 2
  const shape = outgoing ? pick(OUTGOING, i) : pick(INCOMING, i)
  const user = pick(USERS, i * 7 + 3)
  const status = outgoing ? (shape as (typeof OUTGOING)[number]).status : null

  return {
    id: `exc-${String(i + 1).padStart(3, '0')}`,
    at: `2026-10-0${(i % 5) + 1}T${String(7 + (i % 13)).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}:00Z`,
    direction: outgoing ? 'out' : 'in',
    method: shape.method,
    path: shape.path,
    status,
    durationMs: pick(['84', '126', '210', '318', '540', '1 204'], i),
    requestId: `req_${pick(['7KQD82XFM4VT9WAH', 'M2P9ZX4LT7BQC1EV', 'A8RJ5KD3WN6YF0US', 'Q4TB7VC2XM9LH5GZ'], i)}`,
    companyId: user.companyId,
    outcome: shape.outcome,
    request: outgoing ? requestBody(shape.path, user, i) : null,
    response: responseBody(outgoing ? shape.path : 'EVENT', user, i, outgoing ? undefined : shape.path),
    noteCode: status && NOTED_STATUSES.includes(status) ? status : null,
  }
})

/* --- Производные выборки для дашборда -----------------------------------------
   Это ВЫБОРКИ, а не расчёты: фильтрация списка по признаку деньги не считает. */

export const NEGATIVE_USERS = USERS.filter((u) => u.negative)
export const STUCK_USERS = USERS.filter(
  (u) => u.oxenStatus === 'NEEDS_REVIEW' || u.oxenStatus === 'REJECTED',
)
export const CLOSING_CARDS = CARDS.filter((c) => c.status === 'CLOSING')

export function companyById(id: string): Company | undefined {
  return COMPANIES.find((c) => c.id === id)
}

export function companyName(id: string): string {
  return companyById(id)?.name ?? id
}

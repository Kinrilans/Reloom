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

/** Итог проверки AML. `pending` — проверка ещё идёт. */
export type AmlVerdict = 'pass' | 'fail' | 'pending'

/** Что с возвратом по непрошедшему AML поступлению.
 *  `requested` — пользователь нажал «вернуть», деньги ещё не ушли. */
export type RefundState = 'none' | 'requested' | 'sent'

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
  /** HELD — деньги пришли, но AML не пройден: зачисления не было.
   *  REFUNDED — отправлены обратно на адрес отправителя. */
  status: 'SUBMITTED' | 'CREDITED' | 'REJECTED' | 'HELD' | 'REFUNDED'
  /** Пришло само на выданный адрес или заведено оператором руками.
   *  Ручные заявки остаются: автозачисление можно выключить, а старые
   *  заявки из очереди никуда не денутся. */
  source: 'auto' | 'manual'
  /** Адрес, на который пришли деньги. У ручной заявки его нет. */
  addressId: string | null
  address: string | null
  /** Отправитель. Нужен ровно для одного — вернуть туда, откуда пришло. */
  fromAddress: string | null
  /** Вердикт и оценка риска. Оценку даёт внешний сервис, мы её не считаем. */
  amlVerdict: AmlVerdict | null
  amlRisk: string | null
  refund: RefundState
  /** Комиссия сети за отправку возврата. Её удерживает сервис кошелька,
   *  мы её не считаем — число записано готовым. */
  refundFee: Money | null
  /**
   * Кто взял заявку в работу. Пока она за кем-то закреплена, второй
   * оператор её не трогает.
   *
   * Это не украшение интерфейса: без такой пометки двое разбирают одну
   * заявку одновременно и зачисляют деньги дважды. Прятать кнопки —
   * полумера, настоящая защита на стороне сервера (см. правило в
   * docs/flows-admin.md), но увидеть занятую заявку оператор должен
   * до того, как начал в ней работать.
   */
  claimedBy: string | null
  claimedAt: string | null
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

/* Адреса выдуманные и невалидны по контрольной сумме: настоящих
   в прототипе нет (docs/prototype.md). Пул общий для выданных адресов
   и для поступлений — чтобы заявка и адрес в таблице сходились. */
const ADDRESS_POOL = [
  'TQ5nR8vK2mXpL7dYwF3jH9cB4tZaS6eNqU',
  'TJd4nQ8mF2xV6pK1wR7yH3cB9tZaS5eNqL',
  'TRm7xK2nQ9vL4pD8wY3jF6cB1tZaS0eNqH',
  '0x7F4c9A2bE81dC3650aF19b7D4e2C8a05B36fE914',
  '0x3A9dE1c47B20fF8562aD93c1E7b045F8cA216D73',
  '0xC81eB7a4F09D23b5614aE87cD350fB92a7d1E468',
  'UQD2k7bXnLmR4vP9cJ8tY6wE3aZqH5fN1gVxMcB7dKuT',
  'UQBf9mN4kR7xL2vP8dJ3tY6wE1aZqH5cN0gVxMcB7dKs',
  'TWq3nR8vK5mXpL2dYwF7jH1cB9tZaS4eNqM',
  '0x5B2aC93eF71dA480c6E15b9D3f847aB02cD6E915',
  'UQA7k2bXnLmR9vP4cJ1tY8wE5aZqH3fN6gVxMcB2dKuY',
  'TPd6nQ2mF8xV4pK9wR1yH7cB3tZaS2eNqB',
]

/* Адреса отправителей — чужие кошельки, с которых пришли деньги.
   Нужны ровно для одного: вернуть туда, откуда пришло. */
const SENDER_POOL = [
  'TLs9xK4nQ2vM7pD1wY8jF3cB6tZaS5eNqR',
  '0x9D4eB2a7F31cA685b0E73d5C9f216aB84cD0E372',
  'UQC4k9bXnLmR2vP7cJ5tY1wE8aZqH6fN3gVxMcB4dKuW',
  'TKm2nR7vK9mXpL3dYwF1jH8cB5tZaS7eNqV',
  '0x2E8bD53aC90fB147d6A29c8E4b703fA51cD9E286',
  'TBv8xK1nQ6vL9pD4wY2jF7cB3tZaS8eNqJ',
  '0xA14cF86bE23dD709a5B48e1C7f920bD63aE5C104',
  'UQE1k6bXnLmR5vP3cJ9tY4wE7aZqH2fN8gVxMcB9dKuP',
]

/* Очередь намеренно смешанная. Автозачисление включено, но очередь
   не исчезает: часть поступлений не прошла AML и ждёт решения, часть
   заведена оператором руками (пришло не на выданный адрес, прислали
   не ту монету, перевод из обменника). Одна только «счастливая»
   автоматика скрыла бы от руководства ровно те случаи, ради которых
   оператор и нужен. */
export const DEPOSITS: AdminDeposit[] = Array.from({ length: 14 }, (_, i) => {
  const user = pick(USERS, i * 7 + 2)
  const figures = pick(DEPOSIT_FIGURES, i)
  const manual = i % 7 === 3
  const held = i % 5 === 2
  const asset = i % 5 === 3 ? 'USDC' : 'USDT'
  const network = pick(['Tron (TRC-20)', 'Ethereum (ERC-20)', 'TON', 'BNB Smart Chain (BEP-20)'], i)

  return {
    id: `dep-${String(i + 1).padStart(3, '0')}`,
    userId: user.id,
    userName: user.name,
    companyId: user.companyId,
    declared: figures.declared,
    fee: figures.fee,
    net: figures.net,
    network,
    asset,
    txLink: i % 4 === 1 ? null : `https://tronscan.org/#/transaction/9f2c${i}a7b4e`,
    status: held ? 'HELD' : 'SUBMITTED',
    source: manual ? 'manual' : 'auto',
    addressId: manual ? null : `adr-${String((i % 36) + 1).padStart(3, '0')}`,
    address: manual ? null : pick(ADDRESS_POOL, i * 3 + 1),
    fromAddress: manual ? null : pick(SENDER_POOL, i * 5),
    amlVerdict: manual ? null : held ? 'fail' : 'pass',
    /* Оценка риска приходит от сервиса проверки. Мы её не считаем
       и не интерпретируем числом — только сравниваем с порогом. */
    amlRisk: manual ? null : held ? pick(['82', '91', '74'], i) : pick(['4', '11', '23', '2'], i),
    refund: held && i % 10 === 2 ? 'requested' : 'none',
    refundFee: held ? pick(['1.40', '0.90', '2.10'], i) : null,
    /* Одна заявка уже у другого оператора: на ней видно, что бывает,
       когда очередь разбирают вдвоём. Имя записано строкой — список
       операторов объявлен ниже по файлу и на этот момент ещё не создан. */
    claimedBy: i === 1 ? 'Ковалёва Марина' : null,
    claimedAt: i === 1 ? '2026-10-05T14:05:00Z' : null,
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

/* --- Выручка ------------------------------------------------------------------
   Главное число для руководства: сколько мы заработали на комиссиях и
   сколько крипты через нас прошло.

   Все величины посчитаны заранее и разложены по разрезам — по холдингу
   целиком и по каждой компании. Складывать их в коде нельзя: сумма
   комиссий это деньги, и считаться она будет один раз, на этапе 1,
   из леджера и с тестами (docs/prototype.md). */

export interface RevenueSlice {
  /** Прибыль с комиссий за период. */
  profit: Money
  fromDeposits: Money
  fromWithdrawals: Money
  /** Сколько крипты пришло на наши адреса за период. */
  inflow: Money
  /** Разбивка прихода по сетям. Доля — тоже готовое число. */
  networks: { id: string; name: string; asset: string; amount: Money; share: string }[]
}

export const REVENUE: Record<string, RevenueSlice> = {
  all: {
    profit: '18 420.00',
    fromDeposits: '12 960.00',
    fromWithdrawals: '5 460.00',
    inflow: '864 300.00',
    networks: [
      { id: 'trc20', name: 'Tron (TRC-20)', asset: 'USDT', amount: '512 800.00', share: '59' },
      { id: 'erc20', name: 'Ethereum (ERC-20)', asset: 'USDT', amount: '214 500.00', share: '25' },
      { id: 'ton', name: 'TON', asset: 'USDT', amount: '84 000.00', share: '10' },
      { id: 'erc20-usdc', name: 'Ethereum (ERC-20)', asset: 'USDC', amount: '53 000.00', share: '6' },
    ],
  },
  alpha: {
    profit: '9 870.00',
    fromDeposits: '7 120.00',
    fromWithdrawals: '2 750.00',
    inflow: '468 200.00',
    networks: [
      { id: 'trc20', name: 'Tron (TRC-20)', asset: 'USDT', amount: '301 400.00', share: '64' },
      { id: 'erc20', name: 'Ethereum (ERC-20)', asset: 'USDT', amount: '122 800.00', share: '26' },
      { id: 'ton', name: 'TON', asset: 'USDT', amount: '44 000.00', share: '10' },
    ],
  },
  beta: {
    profit: '4 310.00',
    fromDeposits: '3 040.00',
    fromWithdrawals: '1 270.00',
    inflow: '206 700.00',
    networks: [
      { id: 'trc20', name: 'Tron (TRC-20)', asset: 'USDT', amount: '128 900.00', share: '62' },
      { id: 'erc20-usdc', name: 'Ethereum (ERC-20)', asset: 'USDC', amount: '53 000.00', share: '26' },
      { id: 'ton', name: 'TON', asset: 'USDT', amount: '24 800.00', share: '12' },
    ],
  },
  gamma: {
    profit: '2 640.00',
    fromDeposits: '1 820.00',
    fromWithdrawals: '820.00',
    inflow: '121 400.00',
    networks: [
      { id: 'trc20', name: 'Tron (TRC-20)', asset: 'USDT', amount: '62 500.00', share: '51' },
      { id: 'erc20', name: 'Ethereum (ERC-20)', asset: 'USDT', amount: '58 900.00', share: '49' },
    ],
  },
  delta: {
    profit: '1 600.00',
    fromDeposits: '980.00',
    fromWithdrawals: '620.00',
    inflow: '68 000.00',
    networks: [
      { id: 'trc20', name: 'Tron (TRC-20)', asset: 'USDT', amount: '52 800.00', share: '78' },
      { id: 'ton', name: 'TON', asset: 'USDT', amount: '15 200.00', share: '22' },
    ],
  },
}

/* --- Автоматическое зачисление ------------------------------------------------
   Переключатель живёт рядом с комиссиями и меняется тем же правом: это
   одна настройка денег — сколько удержать и зачислять ли без оператора.

   Выключенный переключатель возвращает прежний порядок: поступление
   попадает в очередь и ждёт оператора. Поэтому очередь заявок никуда
   не девается и при включённом автозачислении.

   Ни одно число здесь не считается: порог риска приходит от сервиса
   проверки и только сравнивается с границей, а суммы к зачислению
   лежат готовыми в заявках (docs/prototype.md). */

export const CREDITING = {
  /** Зачислять без участия оператора. */
  auto: true,
  /** Выше этой оценки риска поступление не зачисляется, а удерживается.
      Шкала — внешнего сервиса, своей у нас нет. */
  amlMaxRisk: '70',
  /** Сколько подтверждений сети ждём, прежде чем считать деньги пришедшими. */
  confirmations: '3',
  /**
   * Что делать, когда сервис проверки молчит.
   *
   * `false` — поступления копятся и ждут оператора: непроверенные деньги
   * не зачисляются. Это значение по умолчанию, и оно осознанное: сбой
   * у стороннего сервиса не должен превращаться в канал, по которому
   * к нам заходит что угодно.
   *
   * `true` — зачислять всё равно. Решение про деньги, а не про удобство,
   * поэтому переключатель отдельный и стоит рядом с автозачислением.
   */
  creditWithoutAml: false,
}

/* --- Крипто-адреса пользователей ---------------------------------------------
   Адрес заводит себе сам пользователь, и адрес закрепляется за ним: по
   поступлению на адрес система знает, чей это платёж, и зачисляет без
   оператора. Общих адресов «на всех» больше нет — по такому адресу
   отправителя не отличить.

   Адрес, на котором поступление не прошло AML, уничтожается после
   возврата и больше не выдаётся никогда. Пользователь заводит новый.
   Причина простая: адрес уже засвечен в сомнительной цепочке, и следующее
   поступление на него будет тянуть за собой ту же историю. */

export type AddressStatus = 'ACTIVE' | 'BURNED'

export interface CryptoAddress {
  id: string
  address: string
  memo: string | null
  asset: string
  network: string
  networkId: string
  userId: string
  userName: string
  companyId: string
  createdAt: string
  status: AddressStatus
  /** Почему адрес уничтожен. Код, не текст (CLAUDE.md, правило 3e). */
  burnReasonCode: string | null
  /** Сколько поступлений пришло на адрес. Число записано руками. */
  deposits: number
  lastDepositAt: string | null
  /** Вердикт последней проверки по этому адресу. */
  amlVerdict: AmlVerdict | null
}

export const CRYPTO_ADDRESSES: CryptoAddress[] = Array.from({ length: 36 }, (_, i) => {
  const user = pick(USERS, i * 5 + 1)
  const asset = i % 4 === 3 ? 'USDC' : 'USDT'
  const net = pick(
    [
      { id: 'trc20', name: 'Tron (TRC-20)' },
      { id: 'erc20', name: 'Ethereum (ERC-20)' },
      { id: 'ton', name: 'TON' },
    ],
    i,
  )
  const burned = i % 9 === 4
  const used = i % 3 !== 1

  return {
    id: `adr-${String(i + 1).padStart(3, '0')}`,
    address: pick(ADDRESS_POOL, i),
    memo: net.id === 'ton' ? String(48201937 + i) : null,
    asset,
    network: net.name,
    networkId: net.id,
    userId: user.id,
    userName: user.name,
    companyId: user.companyId,
    createdAt: `2026-09-${String(10 + (i % 20)).padStart(2, '0')}T${String(9 + (i % 9)).padStart(2, '0')}:${String((i * 11) % 60).padStart(2, '0')}:00Z`,
    status: burned ? 'BURNED' : 'ACTIVE',
    burnReasonCode: burned ? 'amlFailed' : null,
    deposits: used ? (i % 4) + 1 : 0,
    lastDepositAt: used ? `2026-10-0${(i % 5) + 1}T${String(8 + (i % 10)).padStart(2, '0')}:12:00Z` : null,
    amlVerdict: burned ? 'fail' : used ? 'pass' : null,
  }
})

/**
 * Сеть и монета, открытые к пополнению.
 *
 * Адресов здесь больше нет. Раньше оператор заводил общий адрес на всех —
 * теперь адрес заводит себе каждый пользователь, и за ним он и закреплён
 * (см. CRYPTO_ADDRESSES). По общему адресу отправителя не отличить,
 * а значит и зачислить без оператора нельзя.
 *
 * Что осталось оператору: открыть или закрыть пару «сеть + монета»,
 * загрузить значок монеты и задать минимальную сумму. Закрытая пара
 * исчезает из выбора у пользователей, но остаётся в истории прошлых
 * поступлений.
 */
export interface AdminNetwork {
  id: string
  name: string
  asset: string
  requiresMemo: boolean
  isActive: boolean
  /** Иконка монеты. Загружается оператором; в прототипе файлов нет,
      и на её месте кружок с тикером того же размера. */
  iconUrl: string | null
  /** Минимальная сумма для этой пары. Меньше — деньги придут, но
      зачисление уйдёт оператору: в мелких суммах комиссия сети съедает
      перевод целиком. */
  minDeposit: Money
  /** Применяется ли минимум вообще. Отдельный переключатель: «ноль»
      и «минимума нет» — разные вещи, и держать их одним полем значит
      рано или поздно отключить минимум опечаткой. */
  minDepositOn: boolean
  /** Сколько адресов выдано пользователям. Число записано руками. */
  issuedAddresses: number
}

export const NETWORKS: AdminNetwork[] = [
  {
    id: 'trc20',
    name: 'Tron (TRC-20)',
    asset: 'USDT',
    requiresMemo: false,
    isActive: true,
    iconUrl: null,
    minDeposit: '100.00',
    minDepositOn: true,
    issuedAddresses: 14,
  },
  {
    id: 'erc20',
    name: 'Ethereum (ERC-20)',
    asset: 'USDT',
    requiresMemo: false,
    isActive: true,
    iconUrl: null,
    minDeposit: '250.00',
    minDepositOn: true,
    issuedAddresses: 9,
  },
  {
    id: 'ton',
    name: 'TON',
    asset: 'USDT',
    requiresMemo: true,
    isActive: true,
    iconUrl: null,
    minDeposit: '100.00',
    minDepositOn: true,
    issuedAddresses: 8,
  },
  {
    id: 'erc20-usdc',
    name: 'Ethereum (ERC-20)',
    asset: 'USDC',
    requiresMemo: false,
    isActive: true,
    iconUrl: null,
    minDeposit: '250.00',
    minDepositOn: true,
    issuedAddresses: 5,
  },
  {
    id: 'bep20',
    name: 'BNB Smart Chain (BEP-20)',
    asset: 'USDC',
    requiresMemo: false,
    isActive: false,
    iconUrl: null,
    minDeposit: '100.00',
    minDepositOn: false,
    issuedAddresses: 0,
  },
]

/** Монеты, доступные к пополнению. Список закрытый: монета, которой нет
    у эмитента, зачислена не будет. */
export const ASSETS = ['USDT', 'USDC'] as const

/* --- Состояние системы и аудит ----------------------------------------------- */

export const SYSTEM = {
  eventLagSeconds: '14',
  unprocessedEvents: '3',
  lastPoolRead: '2026-10-05T14:02:00Z',
  /* У каждой строки есть, куда перейти: список проблем без перехода
     к самой проблеме заставляет оператора искать её руками. */
  pendingTransfers: [
    {
      id: 'tr-1',
      userId: USERS[12]!.id,
      userName: USERS[12]!.name,
      amount: '200.00',
      state: 'SOURCE_REDUCED',
      at: '2026-10-05T13:41:00Z',
    },
    {
      id: 'tr-2',
      userId: USERS[48]!.id,
      userName: USERS[48]!.name,
      amount: '1 500.00',
      state: 'PENDING',
      at: '2026-10-05T12:08:00Z',
    },
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
  /* Внешние сервисы, от которых зависит автозачисление. Ключей доступа
     здесь нет и не будет: они живут в переменных окружения и в интерфейс
     не выводятся ни в каком виде (CLAUDE.md, правило 7). Оператору нужно
     другое — работает сервис или нет, и когда отвечал в последний раз.

     Название узла — данные, они не переводятся. Подпись сервиса — код. */
  services: [
    {
      id: 'svc-oxen',
      code: 'oxen',
      host: 'api.sbx.oxen.finance',
      ok: true,
      lastAt: '2026-10-05T14:02:00Z',
      noteCode: null,
    },
    {
      id: 'svc-addresses',
      code: 'addresses',
      host: 'new.cryptocurrencyapi.net',
      ok: true,
      lastAt: '2026-10-05T13:58:00Z',
      noteCode: null,
    },
    {
      id: 'svc-aml',
      code: 'aml',
      host: 'getblock.net',
      ok: false,
      lastAt: '2026-10-05T13:11:00Z',
      /* Пока проверка недоступна, зачислять нельзя: непроверенное
         поступление копится в очереди, а не зачисляется «на доверии». */
      noteCode: 'amlUnavailable',
    },
  ],
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
  const kind = i % 10
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
    /* Автозачисление и уничтожение адреса — события того же веса, что
       правка ставки: одно меняет порядок движения денег для всех, другое
       отрезает адрес навсегда. Оба помечены. */
    { action: 'autoCreditToggled', type: 'settings', highlight: true },
    { action: 'addressBurned', type: 'address', highlight: true },
    { action: 'refundSent', type: 'deposit', highlight: true },
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

/** С кем шёл обмен. Сервисов стало три, и разбирать их вперемешку
 *  нельзя: у выпуска карты и у проверки AML разные поводы для разбора. */
export type ExchangeService = 'oxen' | 'addresses' | 'aml'

export interface ExchangeEntry {
  id: string
  at: string
  service: ExchangeService
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

/** Обмен с эмитентом. Строки разложены по кругу, суммы в телах — готовые
    строки из тех же демо-данных. Ничего не вычисляется. */
const OXEN_LOG: ExchangeEntry[] = Array.from({ length: 48 }, (_, i) => {
  const outgoing = i % 3 !== 2
  const shape = outgoing ? pick(OUTGOING, i) : pick(INCOMING, i)
  const user = pick(USERS, i * 7 + 3)
  const status = outgoing ? (shape as (typeof OUTGOING)[number]).status : null

  return {
    id: `exc-${String(i + 1).padStart(3, '0')}`,
    at: `2026-10-0${(i % 5) + 1}T${String(7 + (i % 13)).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}:00Z`,
    service: 'oxen' as ExchangeService,
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

/* Обмен с сервисом адресов и с проверкой AML.

   Тела показаны уже вычищенными: ключ доступа к сервису в журнал не
   попадает никогда (CLAUDE.md, правило 7). Проверка AML возвращает
   оценку риска — её мы не считаем и не пересчитываем, только сравниваем
   с порогом из настроек. */
const SERVICE_LOG: ExchangeEntry[] = [
  {
    id: 'exc-101',
    at: '2026-10-05T13:58:00Z',
    service: 'addresses',
    direction: 'out',
    method: 'GET',
    path: '/v2/address/new',
    status: '200',
    durationMs: '412',
    requestId: 'req_ADR7KQD82XFM4VT',
    companyId: COMPANIES[0]!.id,
    outcome: 'ok',
    request: JSON.stringify({ currency: 'USDT.TRC20', externalId: 'usr-014' }, null, 2),
    response: JSON.stringify(
      { result: { address: 'TQ5nR8vK2mXpL7dYwF3jH9cB4tZaS6eNqU', tag: null } },
      null,
      2,
    ),
    noteCode: null,
  },
  {
    id: 'exc-102',
    at: '2026-10-05T13:41:00Z',
    service: 'addresses',
    direction: 'in',
    method: 'EVENT',
    path: 'payment.received',
    status: null,
    durationMs: '18',
    requestId: 'req_ADR2P9ZX4LT7BQC',
    companyId: COMPANIES[0]!.id,
    outcome: 'ok',
    request: null,
    response: JSON.stringify(
      {
        address: 'TQ5nR8vK2mXpL7dYwF3jH9cB4tZaS6eNqU',
        from: 'TLs9xK4nQ2vM7pD1wY8jF3cB6tZaS5eNqR',
        currency: 'USDT.TRC20',
        amount: '500.00',
        confirmations: 3,
      },
      null,
      2,
    ),
    noteCode: null,
  },
  {
    id: 'exc-103',
    at: '2026-10-05T13:41:20Z',
    service: 'aml',
    direction: 'out',
    method: 'POST',
    path: '/aml/check',
    status: '200',
    durationMs: '1 840',
    requestId: 'req_AML8RJ5KD3WN6YF',
    companyId: COMPANIES[0]!.id,
    outcome: 'ok',
    request: JSON.stringify(
      { chain: 'tron', address: 'TLs9xK4nQ2vM7pD1wY8jF3cB6tZaS5eNqR', direction: 'in' },
      null,
      2,
    ),
    response: JSON.stringify({ riskScore: 4, signals: [] }, null, 2),
    noteCode: null,
  },
  {
    id: 'exc-104',
    at: '2026-10-05T12:30:00Z',
    service: 'aml',
    direction: 'out',
    method: 'POST',
    path: '/aml/check',
    status: '200',
    durationMs: '2 110',
    requestId: 'req_AMLQ4TB7VC2XM9L',
    companyId: COMPANIES[1]!.id,
    outcome: 'ok',
    request: JSON.stringify(
      { chain: 'ethereum', address: '0x9D4eB2a7F31cA685b0E73d5C9f216aB84cD0E372', direction: 'in' },
      null,
      2,
    ),
    response: JSON.stringify({ riskScore: 91, signals: ['mixer', 'sanctions_proximity'] }, null, 2),
    noteCode: 'amlFailed',
  },
  {
    id: 'exc-105',
    at: '2026-10-05T13:11:00Z',
    service: 'aml',
    direction: 'out',
    method: 'POST',
    path: '/aml/check',
    status: '504',
    durationMs: '30 000',
    requestId: 'req_AML3PLQ8ZR5ZVM9',
    companyId: COMPANIES[2]!.id,
    outcome: 'failed',
    request: JSON.stringify(
      { chain: 'tron', address: 'TKm2nR7vK9mXpL3dYwF1jH8cB5tZaS7eNqV', direction: 'in' },
      null,
      2,
    ),
    response: JSON.stringify({ error: 'gateway timeout' }, null, 2),
    noteCode: 'amlUnavailable',
  },
  {
    id: 'exc-106',
    at: '2026-10-04T18:22:00Z',
    service: 'addresses',
    direction: 'out',
    method: 'POST',
    path: '/v2/send',
    status: '200',
    durationMs: '920',
    requestId: 'req_ADR5KD3WN6YF0US',
    companyId: COMPANIES[1]!.id,
    outcome: 'ok',
    /* Возврат отправителю по непрошедшему AML поступлению. */
    request: JSON.stringify(
      {
        currency: 'USDT.ERC20',
        to: '0x9D4eB2a7F31cA685b0E73d5C9f216aB84cD0E372',
        amount: '1 200.00',
      },
      null,
      2,
    ),
    response: JSON.stringify({ result: { txId: '0x4b1f…c7a2' } }, null, 2),
    noteCode: 'refundSent',
  },
]

/** Весь обмен с внешними сервисами, в одном журнале. */
export const EXCHANGE_LOG: ExchangeEntry[] = [...OXEN_LOG, ...SERVICE_LOG]

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

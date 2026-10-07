/**
 * Демо-сценарий: заготовленные персонажи и полный список состояний.
 *
 * Это единственный источник для панели переключения (П3) и для каталога
 * состояний из П1 — иначе два списка неизбежно разъедутся, и показывать
 * руководству будут один, а проверять по приёмке другой.
 *
 * Панель — инструмент прототипа. В продукт она не переносится, поэтому
 * подписи здесь живут на одном языке и в словарь не выносятся: словарь
 * описывает продукт, а не стенд для показа.
 *
 * Переход между состояниями — ПОДМЕНА ДЕМО-ДАННЫХ, а не вычисление
 * (docs/prototype.md). Ни одна строка здесь ничего не считает.
 */

/** Поверхность, на которой живёт состояние. */
export type Surface = 'app' | 'admin'

export interface DemoState {
  /** Код из docs/states-user.md, если состояние оттуда. «—» для прочих. */
  code: string
  title: string
  surface: Surface
  /** Сценарий демо-данных клиентской части. */
  scenario?: string
  /** Компания, в разрезе которой открывается админка. */
  company?: string
  href: string
}

export interface DemoGroup {
  title: string
  /** Короткое пояснение к группе. Панель открывают редко и впопыхах. */
  note?: string
  items: DemoState[]
}

/**
 * Пять персонажей из docs/prototype.md. Вынесены в отдельную группу
 * и стоят первыми: на показе идут именно по ним, остальное — про запас.
 */
export const PERSONAS: DemoState[] = [
  {
    code: 'П1',
    title: 'Новый пользователь, профиль на проверке',
    surface: 'app',
    scenario: 'profilePending',
    href: '/app',
  },
  {
    code: 'П2',
    title: 'Активный пользователь с двумя картами',
    surface: 'app',
    scenario: 'default',
    href: '/app',
  },
  {
    code: 'П3',
    title: 'Пользователь в минусе, карты заморожены',
    surface: 'app',
    scenario: 'negative',
    href: '/app',
  },
  {
    code: 'П4',
    title: 'Карта закрывается, есть удержание',
    surface: 'app',
    scenario: 'closing',
    href: '/app/card/card-primary',
  },
  {
    code: 'П5',
    title: 'Компания с запасом ниже порога',
    surface: 'admin',
    company: 'beta',
    href: '/admin',
  },
]

/** Полный каталог состояний клиентской части из docs/states-user.md. */
export const USER_STATES: DemoGroup[] = [
  {
    title: 'А. Аккаунт и доступ',
    items: [
      { code: '—', title: 'Выбор способа входа', surface: 'app', href: '/app/login' },
      { code: '—', title: 'Вход изнутри Telegram', surface: 'app', href: '/app/login?state=webapp' },
      { code: '—', title: 'Вход по почте: адрес', surface: 'app', href: '/app/login?state=email' },
      { code: '—', title: 'Вход по почте: пароль', surface: 'app', href: '/app/login?state=password' },
      { code: '—', title: 'Подтверждение почты кодом', surface: 'app', href: '/app/login?state=code' },
      { code: '—', title: 'Код из письма не подошёл', surface: 'app', href: '/app/login?state=wrong' },
      { code: '—', title: 'Подключение второго фактора', surface: 'app', href: '/app/settings' },
      { code: '—', title: 'Почта не подтверждена', surface: 'app', href: '/app/settings?state=unverified' },
      { code: '—', title: 'Пароль не задан', surface: 'app', href: '/app/settings?state=nopassword' },
      { code: 'А-1', title: 'Аккаунт не привязан', surface: 'app', href: '/app/onboarding' },
      { code: 'А-2', title: 'Код привязки не подошёл', surface: 'app', href: '/app/onboarding?state=invalid' },
      { code: 'А-3', title: 'Задание PIN приложения', surface: 'app', href: '/app/onboarding?state=pin' },
      { code: 'А-4', title: 'Выдача кода восстановления', surface: 'app', href: '/app/onboarding?state=recovery' },
      { code: 'А-5', title: 'Профиль на проверке', surface: 'app', scenario: 'profilePending', href: '/app' },
      { code: 'А-6', title: 'Профиль застрял', surface: 'app', scenario: 'profileStuck', href: '/app' },
      { code: 'А-7', title: 'Пользователь заблокирован', surface: 'app', scenario: 'blocked', href: '/app' },
      { code: 'А-8', title: 'Карантин после смены Telegram', surface: 'app', scenario: 'quarantine', href: '/app' },
      { code: '—', title: 'Восстановление с другого Telegram', surface: 'app', href: '/app/recovery' },
    ],
  },
  {
    title: 'Б. Деньги и карты',
    items: [
      { code: 'Б-1', title: 'Нет карт, баланс нулевой', surface: 'app', scenario: 'empty', href: '/app' },
      { code: 'Б-2', title: 'Нет карт, баланс есть', surface: 'app', scenario: 'funded', href: '/app' },
      { code: 'Б-3', title: 'Достигнут предел в две карты', surface: 'app', scenario: 'default', href: '/app' },
      { code: 'Б-4', title: 'Выпуск карты выполняется', surface: 'app', scenario: 'oneCard', href: '/app/issue' },
      { code: 'Б-5', title: 'Выпуск карты не удался', surface: 'app', href: '/app/issue?state=failed' },
      { code: 'Б-6', title: 'Перевод выполняется', surface: 'app', href: '/app/transfer?state=progress' },
      { code: 'Б-7', title: 'Перевод не завершился', surface: 'app', href: '/app/transfer?state=stuck' },
      { code: 'Б-8', title: 'Баланс ушёл в минус', surface: 'app', scenario: 'negative', href: '/app' },
      {
        code: 'Б-9',
        title: 'Карта заморожена пользователем',
        surface: 'app',
        scenario: 'frozenByUser',
        href: '/app/card/card-primary',
      },
      {
        code: 'Б-10',
        title: 'Карта заморожена из-за минуса',
        surface: 'app',
        scenario: 'negative',
        href: '/app/card/card-primary',
      },
      {
        code: 'Б-11',
        title: 'Карта закрывается, удержание',
        surface: 'app',
        scenario: 'closing',
        href: '/app/card/card-primary',
      },
      {
        code: 'Б-12',
        title: 'При закрытии не выпустилась новая карта',
        surface: 'app',
        href: '/app/card/card-primary/close?state=failed',
      },
      {
        code: 'Б-13',
        title: 'Карта закрыта',
        surface: 'app',
        scenario: 'closed',
        href: '/app/card/card-primary',
      },
      { code: '—', title: 'Пополнение: выбор монеты и сети', surface: 'app', href: '/app/topup' },
      {
        code: '—',
        title: 'Поступление идёт: подтверждения сети',
        surface: 'app',
        scenario: 'default',
        href: '/app',
      },
      {
        code: '—',
        title: 'Поступление на проверке происхождения',
        surface: 'app',
        scenario: 'incomingChecking',
        href: '/app',
      },
      {
        code: '—',
        title: 'Поступление не прошло проверку',
        surface: 'app',
        scenario: 'incomingRejected',
        href: '/app',
      },
      { code: '—', title: 'Ручной режим: заявка руками', surface: 'app', href: '/app/topup?state=manual' },
      { code: 'Б-14', title: 'Заявка на проверке (ручной режим)', surface: 'app', href: '/app/topup?state=pending' },
      { code: 'Б-15', title: 'Заявка отклонена', surface: 'app', href: '/app/topup?state=rejected' },
      { code: 'Б-16', title: 'Сумма меньше минимальной', surface: 'app', href: '/app/topup?state=belowMin' },
      { code: '—', title: 'Крипто-адрес ещё не создан', surface: 'app', href: '/app/topup' },
      { code: '—', title: 'Адрес уничтожен после возврата', surface: 'app', href: '/app/topup?state=burned' },
      { code: '—', title: 'Пополнение не прошло AML', surface: 'app', href: '/app/refund' },
      { code: '—', title: 'Возврат отправлен', surface: 'app', href: '/app/refund?state=sent' },
    ],
  },
  {
    title: 'В. Внешние ограничения',
    items: [
      { code: 'В-1', title: 'Пул компании исчерпан', surface: 'app', scenario: 'poolExhausted', href: '/app' },
      {
        code: 'В-2',
        title: 'Исчерпан бюджет просмотров реквизитов',
        surface: 'app',
        href: '/app/card/card-primary/secrets?state=throttled',
      },
      { code: 'В-3', title: 'Сервис недоступен', surface: 'app', scenario: 'offline', href: '/app' },
      { code: 'В-4', title: '3DS-код получен', surface: 'app', href: '/app/challenge' },
      { code: 'В-5', title: '3DS-код пришёл просроченным', surface: 'app', href: '/app/challenge?state=expired' },
      { code: '—', title: 'Лента уведомлений и 3DS-кодов', surface: 'app', href: '/app/notifications' },
    ],
  },
  {
    title: 'Г. Мультивалютные операции',
    items: [
      {
        code: 'Г-1',
        title: 'Холд и списание разошлись по курсу',
        surface: 'app',
        scenario: 'default',
        href: '/app/history/op-3',
      },
      {
        code: '—',
        title: 'Мерчант дописал сумму (чаевые)',
        surface: 'app',
        scenario: 'default',
        href: '/app/history/op-4',
      },
      {
        code: 'Г-2',
        title: 'Возврат пришёл меньше покупки',
        surface: 'app',
        scenario: 'default',
        href: '/app/history/op-5',
      },
      {
        code: 'Г-3',
        title: 'Операция в чужой валюте в списке',
        surface: 'app',
        scenario: 'default',
        href: '/app/history',
      },
    ],
  },
]

/**
 * Состояния админки. Их не перечисляет отдельный документ, поэтому здесь
 * то, что показывают на демонстрации: пул под порогом и в минусе, очередь
 * заявок, аномальная операция, экран входа.
 */
export const ADMIN_STATES: DemoGroup[] = [
  {
    title: 'Д. Оператор',
    items: [
      { code: '—', title: 'Пул в норме', surface: 'admin', company: 'alpha', href: '/admin' },
      { code: '—', title: 'Запас ниже порога 10 %', surface: 'admin', company: 'beta', href: '/admin' },
      { code: '—', title: 'Покрытие отрицательное', surface: 'admin', company: 'delta', href: '/admin' },
      { code: '—', title: 'Очередь заявок на пополнение', surface: 'admin', href: '/admin/deposits' },
      { code: '—', title: 'Крипто-адреса пользователей', surface: 'admin', href: '/admin/addresses' },
      { code: '—', title: 'Автозачисление и порог AML', surface: 'admin', href: '/admin/settings/fees' },
      { code: '—', title: 'Аномалии в транзакциях', surface: 'admin', href: '/admin/transactions' },
      { code: '—', title: 'Состояние системы и сверки', surface: 'admin', href: '/admin/system' },
      { code: '—', title: 'Журнал обмена с эмитентом', surface: 'admin', href: '/admin/exchange' },
      { code: '—', title: 'Экран входа', surface: 'admin', href: '/admin/login' },
    ],
  },
]

export const DEMO_GROUPS: DemoGroup[] = [
  {
    title: 'Персонажи',
    note: 'Пять заготовленных состояний из плана прототипа — по ним идёт показ.',
    items: PERSONAS,
  },
  ...USER_STATES,
  ...ADMIN_STATES,
]

/** Параметр, которым состояние переносится между поверхностями.
 *  Отдельный от `state`: тот выбирает подсостояние внутри экрана. */
export const PERSONA_PARAM = 'persona'
export const COMPANY_PARAM = 'company'

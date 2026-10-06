'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Inbox,
  Search,
  Snowflake,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import {
  Amount,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Input,
  List,
  ListRow,
  Logo,
  Modal,
  Select,
  SkeletonList,
  Switch,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
  ThemeToggle,
  Toast,
  ToastViewport,
} from '@/ui'
import type { SelectOption } from '@/ui'
import { I18nProvider, PROTOTYPE_LOCALE } from '@/i18n'
import styles from './showcase.module.css'

/* Все данные ниже — выдуманные константы для показа компонентов.
   Денежной логики в прототипе нет: ни одна сумма здесь не вычисляется
   (docs/prototype.md). Номера карт невалидны по контрольной сумме. */

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {note ? <p className={styles.sectionNote}>{note}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.block}>
      <div className={styles.blockLabel}>{label}</div>
      {children}
    </div>
  )
}

const COLORS: { name: string; value: string; note: string }[] = [
  { name: '--brand', value: 'var(--brand)', note: 'основной фиолетовый' },
  { name: '--brand-dark', value: 'var(--brand-dark)', note: 'низ градиента' },
  { name: '--accent', value: 'var(--accent)', note: 'акцент, лайм' },
  { name: '--accent-dark', value: 'var(--accent-dark)', note: 'акцент, мята' },
  { name: '--bg', value: 'var(--bg)', note: 'фон' },
  { name: '--surface', value: 'var(--surface)', note: 'карточки' },
  { name: '--surface-2', value: 'var(--surface-2)', note: 'вложенное, ховер' },
  { name: '--border', value: 'var(--border)', note: 'границы' },
  { name: '--danger', value: 'var(--danger)', note: 'служебный: отказ' },
  { name: '--warning', value: 'var(--warning)', note: 'служебный: порог' },
]

const GRADIENTS: { name: string; value: string; note: string }[] = [
  { name: '--grad-brand', value: 'var(--grad-brand)', note: 'крупные плашки' },
  { name: '--grad-brand-ui', value: 'var(--grad-brand-ui)', note: 'кнопки, 4.74:1' },
  { name: '--grad-accent', value: 'var(--grad-accent)', note: 'подтверждение' },
]

const TYPE_SCALE: { label: string; token: string; size: string; weight: number }[] = [
  { label: 'Баланс-герой', token: '--fs-display', size: '44 / 1.0', weight: 700 },
  { label: 'Крупный заголовок', token: '--fs-title', size: '32 / 1.1', weight: 700 },
  { label: 'Число KPI', token: '--fs-kpi', size: '28 / 1.1', weight: 700 },
  { label: 'Заголовок экрана', token: '--fs-h1', size: '20 / 1.25', weight: 600 },
  { label: 'Заголовок секции', token: '--fs-h2', size: '16 / 1.3', weight: 600 },
  { label: 'Основной текст', token: '--fs-body', size: '15 / 1.45', weight: 500 },
  { label: 'Подпись и таблицы', token: '--fs-caption', size: '13 / 1.4', weight: 400 },
  { label: 'Шапка таблицы', token: '--fs-micro', size: '12 / 1.4', weight: 400 },
]

const NETWORKS: SelectOption[] = [
  { value: 'trc20', label: 'Tron (TRC-20) · USDT' },
  { value: 'erc20', label: 'Ethereum (ERC-20) · USDT' },
  { value: 'bep20', label: 'BNB Smart Chain (BEP-20) · USDT' },
  { value: 'ton', label: 'TON · USDT' },
  { value: 'sol', label: 'Solana · USDC' },
  { value: 'arb', label: 'Arbitrum One · USDT', disabled: true },
  { value: 'pol', label: 'Polygon · USDC' },
]

const COMPANIES: SelectOption[] = [
  { value: 'alpha', label: 'Holding Alpha' },
  { value: 'beta', label: 'Holding Beta' },
  { value: 'gamma', label: 'Holding Gamma' },
]

const REJECT_REASONS: SelectOption[] = [
  { value: 'not-found', label: 'Платёж не найден' },
  { value: 'mismatch', label: 'Сумма не совпадает' },
  { value: 'no-link', label: 'Нет ссылки на транзакцию' },
  { value: 'other', label: 'Другое' },
]

const SPACES = ['4', '8', '12', '16', '20', '24', '32', '40', '48', '64']

const RADII: { name: string; token: string }[] = [
  { name: 'поля, кнопки', token: '--radius-field' },
  { name: 'карточки', token: '--radius-card' },
  { name: 'крупные плашки', token: '--radius-slab' },
  { name: 'пилюли', token: '--radius-pill' },
]

const OPERATIONS: {
  merchant: string
  meta: string
  value: string
  local?: string
  struck?: boolean
}[] = [
  { merchant: 'SQ *COFFEE SHOP 4411', meta: 'Сегодня, 10:45', value: '-12.40' },
  { merchant: 'AMAZON MKTPL*2H4KL', meta: 'Вчера, 20:12', value: '-49.99' },
  { merchant: 'CARREFOUR CITY 0391', meta: '3 октября, 14:02', value: '-120.50', local: '110.00 EUR' },
  { merchant: 'UBER *TRIP', meta: '2 октября, 09:31', value: '-18.00', struck: true },
]

const USERS: {
  name: string
  company: string
  status: ReactNode
  balance: string
  cards: string
  flagged?: boolean
}[] = [
  {
    name: 'Иванов Сергей',
    company: 'Holding Alpha',
    status: <Badge tone="success">Активен</Badge>,
    balance: '1 240.00',
    cards: '2',
  },
  {
    name: 'Петрова Анна',
    company: 'Holding Beta',
    status: <Badge tone="warning">На проверке</Badge>,
    balance: '0.00',
    cards: '0',
  },
  {
    name: 'Козлов Дмитрий',
    company: 'Holding Alpha',
    status: <Badge tone="danger">Минус на счету</Badge>,
    balance: '-23.40',
    cards: '2',
    flagged: true,
  },
  {
    name: 'Смирнова Ольга',
    company: 'Holding Gamma',
    status: <Badge tone="neutral">Заблокирован</Badge>,
    balance: '860.00',
    cards: '1',
  },
]

/* Витрина тоже живёт внутри словаря: компоненты системы берут из него свои
   подписи — «Закрыть», «Выберите значение», подпись темы. Без провайдера
   они бы просто не отрисовались. */
export default function ShowcasePage() {
  return (
    <I18nProvider initialLocale={PROTOTYPE_LOCALE}>
      <Showcase />
    </I18nProvider>
  )
}

function Showcase() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarTitle}>
          <Logo variant="lockup" tone="current" height={22} title="Reloom" />
          <span className={styles.topbarMeta}>Витрина компонентов · П0</span>
        </div>
        <ThemeToggle labelled size="sm" />
      </header>

      <main className={styles.main}>
        {/* ----------------------------------------------------------------- */}
        <Section
          title="Цвет"
          note="Палитра закрыта: это полный список цветов продукта. Фирменные значения взяты из design/logo/*.svg. Статусные (danger, warning) — служебные, в brand.md их нет; они отделены от фирменных намеренно, чтобы бренд менялся независимо."
        >
          <Block label="Токены">
            <div className={styles.swatches}>
              {COLORS.map((c) => (
                <div className={styles.swatch} key={c.name}>
                  <div className={styles.swatchChip} style={{ background: c.value }} />
                  <div>
                    <div className={styles.swatchName}>{c.name}</div>
                    <div className={styles.swatchNote}>{c.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </Block>

          <Block label="Градиенты — диагональ как в логотипе">
            <div className={styles.swatches}>
              {GRADIENTS.map((g) => (
                <div className={styles.swatch} key={g.name}>
                  <div className={styles.swatchChip} style={{ background: g.value }} />
                  <div>
                    <div className={styles.swatchName}>{g.name}</div>
                    <div className={styles.swatchNote}>{g.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </Block>
        </Section>

        {/* ----------------------------------------------------------------- */}
        <Section
          title="Типографика"
          note="Одна гарнитура на весь продукт — Onest. Цифры моноширинные везде, иначе колонка с суммами прыгает при обновлении."
        >
          {TYPE_SCALE.map((t) => (
            <div className={styles.typeRow} key={t.token}>
              <span style={{ fontSize: `var(${t.token})`, fontWeight: t.weight, lineHeight: 1.1 }}>
                {t.label}
              </span>
              <span className={styles.typeMeta}>
                {t.token} · {t.size} · {t.weight}
              </span>
            </div>
          ))}
        </Section>

        {/* ----------------------------------------------------------------- */}
        <Section title="Отступы и радиусы" note="Шаг сетки 4px. Значений мимо шкалы нет.">
          <Block label="Отступы">
            <div className={styles.stack}>
              {SPACES.map((s) => (
                <div className={styles.spaceRow} key={s}>
                  <div className={styles.spaceBar} style={{ width: `var(--space-${s})` }} />
                  <span>--space-{s}</span>
                </div>
              ))}
            </div>
          </Block>
          <Block label="Радиусы">
            <div className={styles.row}>
              {RADII.map((r) => (
                <div
                  className={styles.radiusChip}
                  key={r.token}
                  style={{ borderRadius: `var(${r.token})` }}
                >
                  {r.name}
                </div>
              ))}
            </div>
          </Block>
        </Section>

        {/* ----------------------------------------------------------------- */}
        <Section
          title="Логотип"
          note="Собран из контуров design/logo/reloom-white.svg. Знак не меньше 24px, на пёстрый фон без подложки не ставится."
        >
          <div className={styles.row}>
            <Logo variant="lockup" tone="accent" height={32} title="Reloom" />
            <Logo variant="lockup" tone="brand" height={32} title="Reloom" />
            <Logo variant="lockup" tone="current" height={32} title="Reloom" />
            <Logo variant="mark" tone="accent" height={40} title="Reloom" />
            <Logo variant="mark" tone="brand" height={40} title="Reloom" />
            <Logo variant="mark" tone="current" height={24} title="Reloom" />
          </div>
        </Section>

        {/* ----------------------------------------------------------------- */}
        <Section
          title="Кнопки"
          note="Одна главная кнопка на экран, остальное нейтральное. Акцентная — для подтверждающего действия: зелёный применяется точечно."
        >
          <Block label="Варианты">
            <div className={styles.row}>
              <Button variant="primary">Выпустить карту</Button>
              <Button variant="accent">Подтвердить</Button>
              <Button variant="secondary">Отмена</Button>
              <Button variant="ghost">Подробнее</Button>
              <Button variant="danger">Заблокировать</Button>
            </div>
          </Block>
          <Block label="Размеры">
            <div className={styles.row}>
              <Button size="lg">Крупная</Button>
              <Button size="md">Обычная</Button>
              <Button size="sm">Мелкая</Button>
            </div>
          </Block>
          <Block label="С иконкой, только иконка, во всю ширину">
            <div className={styles.row}>
              <Button iconStart={<ArrowUpRight size={20} />}>Перевести</Button>
              <Button variant="secondary" iconEnd={<ArrowDownLeft size={20} />}>
                Пополнить
              </Button>
              <Button variant="secondary" iconOnly aria-label="Поиск" iconStart={<Search size={20} />} />
              <Button variant="ghost" iconOnly aria-label="Заморозить" iconStart={<Snowflake size={20} />} />
            </div>
            <Button fullWidth>Кнопка во всю ширину</Button>
          </Block>
          <Block label="Состояния: обычное, загрузка, отключено">
            <div className={styles.row}>
              <Button>Обычная</Button>
              <Button loading>Выпускаем карту</Button>
              <Button disabled>Отключена</Button>
              <Button variant="secondary" loading>
                Загрузка
              </Button>
              <Button variant="secondary" disabled>
                Отключена
              </Button>
            </div>
          </Block>
        </Section>

        {/* ----------------------------------------------------------------- */}
        <Section
          title="Поля"
          note="Фокус с клавиатуры виден всегда. Ошибка передаётся не только цветом: рядом иконка и текст."
        >
          <div className={styles.grid2}>
            <Input label="Имя пользователя" placeholder="Иванов Сергей" />
            <Input
              label="Сумма"
              placeholder="0.00"
              numeric
              defaultValue="500.00"
              hint="Минимальная сумма пополнения — 100 USD"
            />
            <Input
              label="Ссылка на транзакцию"
              placeholder="https://"
              error="Без ссылки заявка может быть отклонена"
            />
            <Input
              label="Поиск"
              placeholder="Имя или last4"
              iconStart={<Search size={18} />}
            />
            <Input label="Адрес кошелька" defaultValue="TQ5n…8vR2" readOnly hint="Только чтение" />
            <Input label="Недоступно" placeholder="Поле отключено" disabled />
            <Select label="Сеть и монета" options={NETWORKS} defaultValue="trc20" />
            <Select label="Компания" options={COMPANIES} placeholder="Все компании" />
            <Select
              label="Причина отклонения"
              options={REJECT_REASONS}
              placeholder="Выберите причину"
              error="Причина обязательна"
            />
            <Select label="Недоступно" options={COMPANIES} defaultValue="alpha" disabled />
          </div>
          <Textarea
            label="Причина отклонения"
            placeholder="Свободный комментарий оператора"
            hint="Текст уходит пользователю полностью"
          />
          <Block label="Флажки и переключатели">
            <div className={styles.stack}>
              <Checkbox label="Я сохранил код восстановления" defaultChecked />
              <Checkbox label="Показывать заблокированных" />
              <Checkbox label="Недоступно" disabled />
              <Switch label="Уведомления о тратах" defaultChecked />
              <Switch label="Уведомления о возвратах" />
              <Switch label="3DS-коды (отключить нельзя)" defaultChecked disabled />
            </div>
          </Block>
        </Section>

        {/* ----------------------------------------------------------------- */}
        <Section
          title="Статусы"
          note="Пилюля всегда несёт точку или иконку плюс подпись: чёрно-белая распечатка и человек с нарушением цветовосприятия читают её одинаково."
        >
          <Block label="Мягкая заливка">
            <div className={styles.row}>
              <Badge tone="neutral">Заблокирован</Badge>
              <Badge tone="brand">Главная карта</Badge>
              <Badge tone="success">Активна</Badge>
              <Badge tone="warning">На проверке</Badge>
              <Badge tone="danger">Отклонено</Badge>
              <Badge tone="warning" icon={<Snowflake size={12} />} dot={false}>
                Заморожена
              </Badge>
            </div>
          </Block>
          <Block label="Плотная заливка — для единичных критических отметок">
            <div className={styles.row}>
              <Badge tone="danger" solid>
                Покрытие −4%
              </Badge>
              <Badge tone="warning" solid>
                Порог 10%
              </Badge>
              <Badge tone="success" solid>
                Зачислено
              </Badge>
              <Badge tone="brand" solid>
                Закрывается
              </Badge>
            </div>
          </Block>
        </Section>

        {/* ----------------------------------------------------------------- */}
        <Section
          title="Суммы"
          note="Формат один во всех языках: 1 234.56 USD. Разделители не локализуются. Дробная часть приглушена цветом, но не размером — иначе ломается выравнивание по колонке. Зелёный для сумм не используется."
        >
          <div className={styles.row}>
            <Amount value="8 200.28" currency="USD" size="display" />
          </div>
          <div className={styles.row}>
            <Amount value="32 678.90" currency="USD" size="kpi" />
            <Amount value="1 240.00" currency="USD" size="body" />
            <Amount value="-23.40" currency="USD" size="caption" />
          </div>
        </Section>

        {/* ----------------------------------------------------------------- */}
        <Section
          title="Карточки"
          note="Вложенные карточки — поверхностью чуть светлее, без границы. Фирменный градиент с зерном уместен на крупных плашках, но не за таблицами и формами: там читаемость падает."
        >
          <div className={styles.grid3}>
            <Card>
              <CardHeader title="Обычная карточка" subtitle="tone=surface" />
              <p className={styles.sectionNote}>
                Рабочая поверхность. Плоская, без градиента.
              </p>
            </Card>
            <Card>
              <CardHeader title="С вложенной" subtitle="tone=nested внутри" />
              <Card tone="nested" density="dense">
                <Amount value="4 312.00" currency="USD" size="kpi" />
              </Card>
            </Card>
            <Card tone="brand" density="flush" grain glow className={styles.cardFace}>
              {/* Отступ лежит на внутренней обёртке, а не на самой карточке:
                  иначе он спорит за один узел с padding базового компонента,
                  специфичность у них одинаковая, и победитель зависит от
                  порядка подключения таблиц стилей. */}
              <div className={styles.cardFaceInner}>
                <div className={styles.cardFaceTop}>
                  <Logo variant="mark" tone="current" height={28} />
                  <span className={styles.cardFaceNote}>Главная</span>
                </div>
                <div>
                  <Amount value="1 240.00" currency="USD" size="kpi" onBrand />
                  <div className={styles.cardFaceLast4}>•••• 4417</div>
                </div>
              </div>
            </Card>
          </div>
        </Section>

        {/* ----------------------------------------------------------------- */}
        <Section
          title="Списки"
          note="Иконка слева, название и подпись в две строки, сумма справа. Название мерчанта приходит сырым и не переводится никогда."
        >
          <Card>
            <CardHeader title="Последние операции" action={<Button variant="ghost" size="sm">Все</Button>} />
            <List>
              {OPERATIONS.map((op) => (
                <ListRow
                  key={op.merchant}
                  media={<CreditCard size={20} />}
                  title={op.merchant}
                  subtitle={op.meta}
                  trailing={
                    <Amount value={op.value} currency="USD" size="body" struck={op.struck} />
                  }
                  trailingNote={op.local ?? (op.struck ? 'Отклонено' : undefined)}
                  onClick={() => undefined}
                />
              ))}
            </List>
          </Card>
        </Section>

        {/* ----------------------------------------------------------------- */}
        <Section
          title="Таблица"
          note="Админка плотная: мелкий шрифт, компактные строки, статусы пилюлями. Строка-аномалия помечается полосой слева, а не только цветом."
        >
          <Card density="flush">
            <Table>
              <THead>
                <TR>
                  <TH>Пользователь</TH>
                  <TH>Компания</TH>
                  <TH>Статус</TH>
                  <TH align="numeric">Баланс</TH>
                  <TH align="numeric">Карты</TH>
                  <TH align="actions">Действия</TH>
                </TR>
              </THead>
              <TBody>
                {USERS.map((u) => (
                  <TR key={u.name} flagged={u.flagged} onClick={() => undefined}>
                    <TD primary>{u.name}</TD>
                    <TD muted>{u.company}</TD>
                    <TD>{u.status}</TD>
                    <TD align="numeric">
                      <Amount value={u.balance} currency="USD" size="caption" />
                    </TD>
                    <TD align="numeric" muted>
                      {u.cards}
                    </TD>
                    <TD align="actions">
                      <Button variant="ghost" size="sm">
                        Открыть
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </Section>

        {/* ----------------------------------------------------------------- */}
        <Section
          title="Уведомления"
          note="Тональность читается не только цветом: слева иконка, у предупреждения и отказа — полоса по краю."
        >
          <ToastViewport>
            <Toast
              tone="success"
              title="Зачисление подтверждено"
              text="На счёт поступило 500.00 USD."
              onClose={() => undefined}
            />
            <Toast
              tone="warning"
              title="Покрытие пула 12%"
              text="Holding Alpha. Ниже порога 15%."
              onClose={() => undefined}
            />
            <Toast
              tone="danger"
              title="Баланс в минусе"
              text="Карты заморожены автоматически. Пополните счёт на 23.40 USD."
              actions={
                <Button size="sm" variant="secondary">
                  Открыть пользователя
                </Button>
              }
              onClose={() => undefined}
            />
            <Toast tone="neutral" title="Перевод выполняется" text="Обычно занимает несколько секунд." />
          </ToastViewport>
        </Section>

        {/* ----------------------------------------------------------------- */}
        <Section
          title="Загрузка, пустота, ошибка"
          note="Для каждого списка спроектировано: пусто, загрузка, ошибка. Состояние без следующего шага — недоделанное состояние."
        >
          <div className={styles.grid3}>
            <Card>
              <CardHeader title="Загрузка" />
              <SkeletonList rows={3} />
            </Card>
            <Card density="flush">
              <EmptyState
                icon={<Wallet size={24} />}
                title="Пока нет операций"
                text="Здесь появятся траты и зачисления, как только вы начнёте пользоваться картой."
              />
            </Card>
            <Card density="flush">
              <EmptyState
                tone="danger"
                icon={<TriangleAlert size={24} />}
                title="Не удалось загрузить"
                text="Сервис временно недоступен. Данные могут обновляться с задержкой."
                action={
                  <Button variant="secondary" size="sm">
                    Повторить
                  </Button>
                }
              />
            </Card>
          </div>
          <Card density="flush">
            <EmptyState
              icon={<Inbox size={24} />}
              title="Нет результатов по фильтру"
              text="Попробуйте изменить период или снять фильтр по компании."
              action={
                <Button variant="ghost" size="sm">
                  Сбросить фильтры
                </Button>
              }
            />
          </Card>
        </Section>

        {/* ----------------------------------------------------------------- */}
        <Section
          title="Модальное окно"
          note="Необратимое действие подтверждается вводом значения, а не просто «ОК». Esc и фокус-ловушка достаются от нативного dialog."
        >
          <div className={styles.row}>
            <Button variant="danger" onClick={() => setModalOpen(true)}>
              Показать окно подтверждения
            </Button>
          </div>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Закрыть карту ••••4417?"
            footer={
              <>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>
                  Отмена
                </Button>
                <Button variant="danger" onClick={() => setModalOpen(false)}>
                  Закрыть карту
                </Button>
              </>
            }
          >
            Карта будет заблокирована, новые траты по ней не пройдут. Перевыпуска не
            существует: новая карта получит другой номер, подписки и сохранённые платежи
            перестанут работать.
            <div className={styles.confirmField}>
              <Input label="Введите последние 4 цифры карты" placeholder="4417" numeric />
            </div>
          </Modal>
        </Section>
      </main>
    </div>
  )
}

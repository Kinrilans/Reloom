'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Plus } from 'lucide-react'
import { Amount, AssetIcon, Badge, Button, Card, CardHeader, Input, List, ListRow, QrPlaceholder, Toast } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { useDemoState } from '@/fixtures/demoState'
import { ASSETS, DEMO, DEPOSIT_TABLE, NETWORKS } from '@/fixtures/scenarios'
import { useStore } from '@/fixtures/store'
import { AppShell } from '../AppShell'

import styles from '../screens.module.css'

/**
 * Пополнение.
 *
 * Порядок выбора — сначала монета, потом сеть, и он обязателен. Пара
 * «монета + сеть» неразрывна: один и тот же Ethereum принимает и USDT,
 * и USDC, адреса у них разные, и перевод не той монетой теряется так же,
 * как перевод не в той сети. Два списка подряд читаются однозначно,
 * а одна строка «Ethereum · USDT» заставляет человека разбирать, что
 * из этого сеть, а что монета.
 *
 * Списки, а не выпадающие поля: монет и сетей у нас немного, но строка
 * со значком узнаётся глазами, а пункт выпадающего списка приходится
 * сначала открыть.
 */

type Step = 'asset' | 'network' | 'address' | 'form' | 'pending' | 'rejected'

export default function TopupPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const { scenario } = useStore()
  const demo = useDemoState()

  const [step, setStep] = useState<Step>('asset')
  const [belowMin, setBelowMin] = useState(false)
  const [asset, setAsset] = useState<string>(ASSETS[0]!.id)
  const [networkId, setNetworkId] = useState(NETWORKS[0]!.id)
  const [amount, setAmount] = useState(DEMO.depositFee.gross)
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  /* Заведён ли адрес у выбранной пары. В прототипе это состояние экрана:
     адрес приходит готовым из демо-данных, заводить его нечем. */
  const [created, setCreated] = useState(false)
  const [burned, setBurned] = useState(false)
  /* Какая строка калькулятора показана. Не расчёт, а выбор из заранее
     посчитанных пар (см. DEPOSIT_TABLE). */
  const [previewGross, setPreviewGross] = useState(DEPOSIT_TABLE[1]!.gross)

  useEffect(() => {
    if (demo === 'pending') setStep('pending')
    if (demo === 'rejected') setStep('rejected')
    if (demo === 'belowMin') {
      setStep('form')
      setBelowMin(true)
    }
    // Адрес уже заведён: экран пополнения, на который человек возвращается.
    if (demo === 'address') {
      setStep('address')
      setCreated(true)
    }
    // Прежний адрес уничтожен после возврата — нужен новый.
    if (demo === 'burned') {
      setStep('address')
      setBurned(true)
    }
    // Ручной режим: автозачисление выключено оператором, и заявку
    // по-прежнему заводит сам человек.
    if (demo === 'manual') setStep('form')
  }, [demo])

  const network = NETWORKS.find((n) => n.id === networkId) ?? NETWORKS[0]!
  const assetInfo = ASSETS.find((a) => a.id === asset) ?? ASSETS[0]!
  const preview = DEPOSIT_TABLE.find((r) => r.gross === previewGross) ?? DEPOSIT_TABLE[0]!

  /** Монета выбрана — дальше её сети, и только они. */
  function pickAsset(next: string) {
    setAsset(next)
    const first = NETWORKS.find((n) => n.asset === next)
    if (first) setNetworkId(first.id)
    setStep('network')
  }

  /** Смена сети сбрасывает адрес: у каждой пары он свой. */
  function pickNetwork(id: string) {
    setNetworkId(id)
    setCreated(false)
    setBurned(false)
    setStep('address')
  }

  function copy(key: string, text: string) {
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    setCopied(key)
    window.setTimeout(() => setCopied(null), 1500)
  }

  /* --- Заявка отклонена (Б-15) -------------------------------------------- */
  if (step === 'rejected') {
    return (
      <AppShell title={t('topup.title')} back>
        <div className={styles.stack}>
          <h1 className={styles.title}>{t('topup.rejected.title')}</h1>
          {/* Причина уходит пользователю ПОЛНЫМ текстом, без сокращений. */}
          <Toast tone="danger" title={t('topup.rejected.text', { reason: DEMO.rejectReason })} />
          <div className={styles.footer}>
            <Button fullWidth onClick={() => setStep('asset')}>
              {t('topup.rejected.action')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  /* --- Шаг 5. Заявка на проверке (Б-14) ----------------------------------- */
  if (step === 'pending') {
    return (
      <AppShell title={t('topup.title')} back>
        <div className={styles.stack}>
          <h1 className={styles.title}>{t('topup.pending.title')}</h1>
          <p className={styles.text}>{t('topup.pending.text', { hours: DEMO.reviewHours })}</p>

          <Card>
            {/* Отметки времени шагов, а не прогресс-бар: проверка ручная. */}
            <div className={styles.steps}>
              <div className={styles.step}>
                <span className={[styles.stepMark, styles.stepDone].join(' ')}>
                  <Check size={12} strokeWidth={3} />
                </span>
                <span className={styles.stepBody}>
                  <span className={styles.stepTitle}>{t('topup.pending.step.sent')}</span>
                  <span className={styles.stepMeta}>
                    {formatDateTime(locale, '2026-10-05T11:04:00Z')}
                  </span>
                </span>
              </div>
              <div className={styles.step}>
                <span className={styles.stepMark} />
                <span className={styles.stepBody}>
                  <span className={styles.stepTitle}>{t('topup.pending.step.review')}</span>
                  <span className={styles.stepMeta}>
                    <Badge tone="warning">{t('op.status.pending')}</Badge>
                  </span>
                </span>
              </div>
              <div className={styles.step}>
                <span className={styles.stepMark} />
                <span className={styles.stepBody}>
                  <span className={styles.stepTitle}>{t('topup.pending.step.credited')}</span>
                </span>
              </div>
            </div>
          </Card>

          <Card tone="nested">
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('topup.form.amount')}</span>
                <span className={styles.rowValue}>
                  <Amount value={amount} currency={scenario.currency} />
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('topup.network')}</span>
                <span className={[styles.rowValue, styles.networkLine].join(' ')}>
                  <AssetIcon asset={network.asset} src={network.iconUrl} />
                  {network.asset} · {network.name}
                </span>
              </div>
            </div>
          </Card>

          <div className={styles.footer}>
            <Button fullWidth onClick={() => router.push('/app')}>
              {t('common.done')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  /* --- Ручной режим. Заявка руками -----------------------------------------
     Нужен, только когда автозачисление выключено в админке. При
     включённом система видит транзакцию сама и ссылку на неё берёт
     тоже сама — заявлять о переводе человеку незачем. */
  if (step === 'form') {
    return (
      <AppShell title={t('topup.title')} back onBack={() => setStep('address')}>
        <div className={styles.stack}>
          <h1 className={styles.title}>{t('topup.form.title')}</h1>

          <Input
            label={t('topup.form.amount')}
            value={amount}
            numeric
            onChange={(e) => setAmount(e.target.value)}
            hint={t('topup.min', { amount: `${DEMO.minDeposit} ${scenario.currency}` })}
          />

          {/* Б-16. Предупреждение показывается ДО отправки средств, а не
              после. Заявку минимум не блокирует: деньги уже отправлены,
              решение принимает оператор. Само сравнение суммы с минимумом
              здесь не считается — это арифметика над деньгами, которой
              в прототипе нет (docs/prototype.md); состояние приходит
              из каталога. */}
          {belowMin ? <Toast tone="warning" title={t('topup.min.warning')} /> : null}

          <Input
            label={t('topup.form.link')}
            placeholder="https://tronscan.org/#/transaction/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            hint={t('topup.form.linkHint')}
          />

          <div className={styles.footer}>
            <Button fullWidth onClick={() => setStep('pending')}>
              {t('topup.form.action')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  /* --- Шаг 3. Адрес ------------------------------------------------------- */
  if (step === 'address') {
    /* Адреса у пары «монета + сеть» может ещё не быть: он не лежит
       готовым, а заводится по запросу и закрепляется за человеком.
       Поэтому экран начинается с кнопки, а не с кода.

       Уничтоженный адрес приводит сюда же: пополнять по нему больше
       нельзя, нужен новый. */
    if (!created) {
      return (
        <AppShell title={t('topup.title')} back onBack={() => setStep('network')}>
          <div className={styles.stack}>
            <div className={styles.networkLine}>
              <AssetIcon asset={network.asset} src={network.iconUrl} size="md" />
              <span className={styles.networkBig}>
                {t('topup.address.heading', { asset: network.asset, network: network.name })}
              </span>
            </div>

            {burned ? (
              <Toast
                tone="warning"
                title={t('topup.create.burnedTitle')}
                text={t('topup.create.burnedText')}
              />
            ) : null}

            <Card>
              <CardHeader
                title={t('topup.create.title')}
                subtitle={t('topup.create.subtitle', {
                  asset: network.asset,
                  network: network.name,
                })}
              />
              <p className={styles.text}>{t('topup.create.text')}</p>
            </Card>

            <div className={styles.footer}>
              <Button fullWidth iconStart={<Plus size={18} />} onClick={() => setCreated(true)}>
                {t('topup.create.action')}
              </Button>
            </div>
          </div>
        </AppShell>
      )
    }

    return (
      <AppShell title={t('topup.title')} back onBack={() => setStep('network')}>
        <div className={styles.stack}>
          <div className={styles.networkLine}>
            <AssetIcon asset={network.asset} src={network.iconUrl} size="md" />
            <span className={styles.networkBig}>
              {t('topup.address.heading', { asset: network.asset, network: network.name })}
            </span>
          </div>

          {/* Адрес личный, и это не деталь: по нему система узнаёт, чей
              пришёл платёж, и зачисляет без оператора. */}
          <Toast tone="neutral" title={t('topup.address.ownTitle')} text={t('topup.address.ownText')} />

          <Card>
            <div className={styles.qr}>
              <QrPlaceholder value={network.address} />
              {/* Предупреждение стоит под самим кодом, а не отдельной
                  плашкой выше: читают его ровно в тот момент, когда
                  наводят камеру, и уводить глаз от кода некуда. */}
              <p className={styles.qrNote}>
                {t('topup.address.only', { asset: network.asset, network: network.name })}
              </p>
            </div>

            {/* Адрес на всю ширину и по центру: его сверяют символ
                за символом, и рваная строка этому мешает. */}
            <p className={[styles.address, styles.addressCenter].join(' ')}>{network.address}</p>
          </Card>

          {network.memo ? (
            <Card tone="nested">
              <CardHeader title={t('topup.address.memo')} subtitle={t('topup.address.memoWarning')} />
              <div className={styles.row}>
                <span className={styles.address}>{network.memo}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={copied === 'memo' ? t('common.copied') : t('common.copy')}
                  iconStart={copied === 'memo' ? <Check size={18} /> : <Copy size={18} />}
                  onClick={() => copy('memo', network.memo!)}
                />
              </div>
            </Card>
          ) : null}

          {/* Условия и калькулятор.

              Сумму человек выбирает сам, и заранее её не знает никто:
              фиксированный расчёт «переведёте 500» на этом экране был
              выдумкой. Поэтому здесь только то, что правда: ставка,
              минимальная сумма и прикидка — сколько зачислится, если
              отправить столько-то.

              Суммы в прикидке подготовлены заранее. Живой пересчёт
              произвольной суммы появится на этапе 1 вместе с леджером
              и тестами: комиссия, посчитанная «чтобы показать», иначе
              переживёт прототип (docs/prototype.md). */}
          <Card>
            <CardHeader title={t('topup.calc.title')} subtitle={t('topup.calc.subtitle')} />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('topup.calc.rate')}</span>
                <span className={styles.rowValue}>
                  {t('topup.calc.rateValue', {
                    percent: DEMO.depositRate.percent,
                    fixed: `${DEMO.depositRate.fixed} ${scenario.currency}`,
                  })}
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('topup.calc.min')}</span>
                <span className={styles.rowValue}>
                  <Amount value={DEMO.minDeposit} currency={scenario.currency} size="caption" />
                </span>
              </div>
            </div>

            <div className={styles.amounts}>
              {DEPOSIT_TABLE.map((row) => (
                <button
                  type="button"
                  key={row.gross}
                  className={[
                    styles.amountChip,
                    row.gross === preview.gross ? styles.amountChipActive : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setPreviewGross(row.gross)}
                >
                  {row.gross}
                </button>
              ))}
            </div>

            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('topup.calc.fee')}</span>
                <span className={styles.rowValue}>
                  <Amount value={preview.fee} currency={scenario.currency} size="caption" />
                </span>
              </div>
              <div className={[styles.row, styles.rowTotal].join(' ')}>
                <span className={styles.rowLabel}>{t('topup.calc.net')}</span>
                <span className={styles.rowValue}>
                  <Amount value={preview.net} currency={scenario.currency} />
                </span>
              </div>
            </div>
          </Card>

          {/* Шага «я отправил» больше нет: транзакцию на адрес система
              видит сама и сама же заносит ссылку в историю. Остаётся
              закрыть экран — ход поступления покажет главная. */}
          <div className={[styles.footer, styles.footerRow].join(' ')}>
            <Button fullWidth onClick={() => router.push('/app')}>
              {t('common.done')}
            </Button>
            <Button
              variant="secondary"
              iconOnly
              aria-label={copied === 'address' ? t('common.copied') : t('common.copy')}
              iconStart={copied === 'address' ? <Check size={20} /> : <Copy size={20} />}
              onClick={() => copy('address', network.address)}
            />
          </div>
        </div>
      </AppShell>
    )
  }

  /* --- Шаг 2. Сеть внутри монеты ------------------------------------------- */
  if (step === 'network') {
    return (
      <AppShell title={t('topup.title')} back onBack={() => setStep('asset')}>
        <div className={styles.stack}>
          <h1 className={styles.title}>{t('topup.network.pick')}</h1>
          <p className={styles.text}>{t('topup.network.text', { asset: assetInfo.id })}</p>

          <List>
            {NETWORKS.filter((n) => n.asset === asset).map((n) => (
              <ListRow
                key={n.id}
                media={<AssetIcon asset={n.asset} src={n.iconUrl} size="md" />}
                title={n.name}
                subtitle={n.asset}
                onClick={() => pickNetwork(n.id)}
              />
            ))}
          </List>
        </div>
      </AppShell>
    )
  }

  /* --- Шаг 1. Монета -------------------------------------------------------- */
  return (
    <AppShell title={t('topup.title')} back>
      <div className={styles.stack}>
        <h1 className={styles.title}>{t('topup.asset.pick')}</h1>

        {/* Минимальная сумма показывается ДО выбора адреса, а не после
            того, как человек уже отправил деньги. */}
        <p className={styles.text}>
          {t('topup.min', { amount: `${DEMO.minDeposit} ${scenario.currency}` })}
        </p>

        <List>
          {ASSETS.map((a) => (
            <ListRow
              key={a.id}
              media={<AssetIcon asset={a.id} src={a.iconUrl} size="md" />}
              title={a.name}
              subtitle={a.id}
              onClick={() => pickAsset(a.id)}
            />
          ))}
        </List>
      </div>
    </AppShell>
  )
}

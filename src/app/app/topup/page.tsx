'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, TriangleAlert } from 'lucide-react'
import { Amount, Badge, Button, Card, CardHeader, Input, QrPlaceholder, Select, Toast } from '@/ui'
import type { SelectOption } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { useDemoState } from '@/fixtures/demoState'
import { DEMO, NETWORKS } from '@/fixtures/scenarios'
import { useStore } from '@/fixtures/store'
import { AppShell } from '../AppShell'

import styles from '../screens.module.css'

type Step = 'network' | 'address' | 'form' | 'pending' | 'rejected'

export default function TopupPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const { scenario } = useStore()
  const demo = useDemoState()

  const [step, setStep] = useState<Step>('network')
  const [belowMin, setBelowMin] = useState(false)
  const [networkId, setNetworkId] = useState(NETWORKS[0]!.id)
  const [amount, setAmount] = useState(DEMO.depositFee.gross)
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (demo === 'pending') setStep('pending')
    if (demo === 'rejected') setStep('rejected')
    if (demo === 'belowMin') {
      setStep('form')
      setBelowMin(true)
    }
  }, [demo])

  const network = NETWORKS.find((n) => n.id === networkId) ?? NETWORKS[0]!
  const options: SelectOption[] = NETWORKS.map((n) => ({
    value: n.id,
    label: `${n.name} · ${n.asset}`,
  }))

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
            <Button fullWidth onClick={() => setStep('network')}>
              {t('topup.rejected.action')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  /* --- Шаг 4. Заявка на проверке (Б-14) ----------------------------------- */
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
                <span className={styles.rowValue}>
                  {network.name} · {network.asset}
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

  /* --- Шаг 3. Подтверждение перевода -------------------------------------- */
  if (step === 'form') {
    return (
      <AppShell title={t('topup.title')} back>
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

  /* --- Шаг 2. Адрес ------------------------------------------------------- */
  if (step === 'address') {
    return (
      <AppShell title={t('topup.title')} back>
        <div className={styles.stack}>
          <div className={styles.stackTight}>
            <span className={styles.note}>{t('topup.network')}</span>
            <span className={styles.networkBig}>
              {network.name} · {network.asset}
            </span>
          </div>

          {/* Предупреждение о сети стоит ДО адреса: перевод в другой сети
              означает потерянные деньги. */}
          <Toast
            tone="warning"
            title={t('topup.address.warning', { network: network.name, asset: network.asset })}
          />

          <Card>
            <div className={styles.qr}>
              <QrPlaceholder value={network.address} />
            </div>
            <div className={styles.stackTight}>
              <p className={styles.address}>{network.address}</p>
              <Button
                variant="secondary"
                size="sm"
                iconStart={copied === 'address' ? <Check size={16} /> : <Copy size={16} />}
                onClick={() => copy('address', network.address)}
              >
                {copied === 'address' ? t('common.copied') : t('common.copy')}
              </Button>
            </div>
          </Card>

          {network.memo ? (
            <Card tone="nested">
              <CardHeader title={t('topup.address.memo')} subtitle={t('topup.address.memoWarning')} />
              <div className={styles.row}>
                <span className={styles.address}>{network.memo}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  iconStart={copied === 'memo' ? <Check size={16} /> : <Copy size={16} />}
                  onClick={() => copy('memo', network.memo!)}
                >
                  {copied === 'memo' ? t('common.copied') : t('common.copy')}
                </Button>
              </div>
            </Card>
          ) : null}

          {/* Расчёт комиссии показывается ДО отправки средств. */}
          <Card>
            <CardHeader title={t('topup.calc.title')} />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('topup.calc.gross')}</span>
                <span className={styles.rowValue}>
                  <Amount value={DEMO.depositFee.gross} currency={scenario.currency} />
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('topup.calc.fee')}</span>
                <span className={styles.rowValue}>
                  <Amount value={DEMO.depositFee.fee} currency={scenario.currency} />
                </span>
              </div>
              <div className={[styles.row, styles.rowTotal].join(' ')}>
                <span className={styles.rowLabel}>{t('topup.calc.net')}</span>
                <span className={styles.rowValue}>
                  <Amount value={DEMO.depositFee.net} currency={scenario.currency} />
                </span>
              </div>
            </div>
          </Card>

          <div className={styles.footer}>
            <Button fullWidth onClick={() => setStep('form')}>
              {t('topup.sent')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  /* --- Шаг 1. Выбор сети и монеты ----------------------------------------- */
  return (
    <AppShell title={t('topup.title')} back>
      <div className={styles.stack}>
        <h1 className={styles.title}>{t('topup.network.pick')}</h1>

        {/* Минимальная сумма показывается ДО выбора адреса, а не после того,
            как человек уже отправил деньги. */}
        <p className={styles.text}>
          {t('topup.min', { amount: `${DEMO.minDeposit} ${scenario.currency}` })}
        </p>

        <Select
          label={t('topup.network')}
          options={options}
          value={networkId}
          onChange={setNetworkId}
        />

        <Toast
          tone="neutral"
          title={t('topup.address.warning', { network: network.name, asset: network.asset })}
        />

        <div className={styles.footer}>
          <Button fullWidth iconStart={<TriangleAlert size={18} />} onClick={() => setStep('address')}>
            {t('common.continue')}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

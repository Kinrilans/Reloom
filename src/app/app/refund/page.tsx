'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Undo2 } from 'lucide-react'
import { Amount, Button, Card, CardHeader, Toast } from '@/ui'
import { useT } from '@/i18n'
import { useDemoState } from '@/fixtures/demoState'
import { DEMO } from '@/fixtures/scenarios'
import { AppShell } from '../AppShell'
import styles from '../screens.module.css'

/**
 * Возврат поступления, не прошедшего проверку.
 *
 * Деньги пришли на крипто-адрес, но в систему не зачислены: проверка
 * не пройдена. Висеть на адресе вечно они не могут, и единственное, что
 * с ними можно сделать, — отправить обратно.
 *
 * **Адрес возврата не выбирается.** Он один: тот, с которого пришли
 * средства. Поле ввода здесь было бы дырой — человека под давлением
 * уговорят вписать чужой адрес, и мы своими руками отправим деньги
 * туда, куда просили мошенники.
 *
 * Возврат делает сервис, к которому подключён кошелёк: он отправляет
 * средства и удерживает комиссию сети. Поэтому сумма к возврату меньше
 * пришедшей, и это написано до нажатия кнопки, а не после.
 *
 * Адрес после ухода средств уничтожается и больше не используется —
 * он засвечен в той же цепочке. Пополнять дальше можно только с нового
 * адреса, и об этом сказано здесь же.
 */

type Step = 'offer' | 'sent'

export default function RefundPage() {
  const t = useT()
  const router = useRouter()
  const demo = useDemoState()

  const [step, setStep] = useState<Step>(demo === 'sent' ? 'sent' : 'offer')

  /* --- Возврат отправлен --------------------------------------------------- */
  if (step === 'sent') {
    return (
      <AppShell title={t('refund.title')} back>
        <div className={styles.stack}>
          <h1 className={styles.title}>{t('refund.sent.title')}</h1>
          <p className={styles.text}>{t('refund.sent.text')}</p>

          <Toast
            tone="neutral"
            title={t('refund.burned.title')}
            text={t('refund.burned.text')}
          />

          <Card tone="nested">
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('refund.returned')}</span>
                <span className={styles.rowValue}>
                  <Amount value={DEMO.refund.returned} currency={DEMO.refund.asset} />
                </span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('refund.to')}</span>
                <span className={[styles.rowValue, styles.address].join(' ')}>
                  {DEMO.refund.from}
                </span>
              </div>
            </div>
          </Card>

          <div className={styles.footer}>
            <Button fullWidth onClick={() => router.push('/app/topup')}>
              {t('refund.newAddress')}
            </Button>
            <Button variant="ghost" fullWidth onClick={() => router.push('/app')}>
              {t('common.done')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  /* --- Предложение вернуть -------------------------------------------------- */
  return (
    <AppShell title={t('refund.title')} back>
      <div className={styles.stack}>
        <h1 className={styles.title}>{t('refund.offer.title')}</h1>
        {/* Причину называем прямо. «Технические работы» здесь были бы
            обманом: отказ не на нашей стороне, и человеку с этими
            деньгами ещё разбираться. */}
        <p className={styles.text}>
          {t('refund.offer.text', {
            amount: `${DEMO.refund.amount} ${DEMO.refund.asset}`,
            network: DEMO.refund.network,
          })}
        </p>

        <Toast tone="warning" title={t('refund.why.title')} text={t('refund.why.text')} />

        <Card>
          <CardHeader title={t('refund.calc.title')} subtitle={t('refund.calc.subtitle')} />
          <div className={styles.rows}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t('refund.received')}</span>
              <span className={styles.rowValue}>
                <Amount value={DEMO.refund.amount} currency={DEMO.refund.asset} size="caption" />
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>{t('refund.networkFee')}</span>
              <span className={styles.rowValue}>
                <Amount
                  value={DEMO.refund.networkFee}
                  currency={DEMO.refund.asset}
                  size="caption"
                />
              </span>
            </div>
            <div className={[styles.row, styles.rowTotal].join(' ')}>
              <span className={styles.rowLabel}>{t('refund.returned')}</span>
              <span className={styles.rowValue}>
                <Amount value={DEMO.refund.returned} currency={DEMO.refund.asset} />
              </span>
            </div>
          </div>
        </Card>

        <Card tone="nested">
          <CardHeader title={t('refund.to')} subtitle={t('refund.toHint')} />
          {/* Адрес показан, но не редактируется: он один и выбору
              не подлежит. */}
          <p className={styles.address}>{DEMO.refund.from}</p>
        </Card>

        <div className={styles.footer}>
          <Button
            fullWidth
            iconStart={<Undo2 size={18} />}
            onClick={() => setStep('sent')}
          >
            {t('refund.action')}
          </Button>
          <p className={styles.note}>
            <Check size={14} /> {t('refund.afterHint')}
          </p>
        </div>
      </div>
    </AppShell>
  )
}

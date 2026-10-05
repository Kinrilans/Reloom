'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CircleCheck, TriangleAlert } from 'lucide-react'
import { Button, Card, CardHeader, EmptyState, Input, List, Toast } from '@/ui'
import { useT } from '@/i18n'
import { useDemoState } from '@/fixtures/demoState'
import { useStore } from '@/fixtures/store'
import { AppShell } from '../../../AppShell'
import { OperationRow } from '../../../_components/OperationRow'
import styles from '../../../screens.module.css'

/**
 * Мастер закрытия карты.
 *
 * Как в банке: сначала карта блокируется, потом разбираются деньги, и
 * только потом она закрывается. Одной кнопкой «отменить» карта не
 * закрывается никогда — отмена в Oxen необратима (docs/domain-and-money.md).
 */

type Step = 'warn' | 'destination' | 'waiting' | 'failed' | 'done'
type Destination = 'child' | 'new'

export default function CloseCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const t = useT()
  const router = useRouter()
  const demo = useDemoState()
  const { card, activeCards, startClosing, finishClosing } = useStore()

  const [step, setStep] = useState<Step>('warn')
  const [confirm, setConfirm] = useState('')
  const [destination, setDestination] = useState<Destination>('child')

  const current = card(id)
  const child = activeCards.find((c) => c.id !== id)

  useEffect(() => {
    if (demo === 'waiting') setStep('waiting')
    if (demo === 'failed') setStep('failed')
    if (demo === 'done') setStep('done')
  }, [demo])

  if (!current) return null

  /* --- Сбой выпуска новой карты (Б-12) ------------------------------------ */
  if (step === 'failed') {
    return (
      <AppShell title={t('close.title')} back>
        <Card density="flush">
          {/* Старая карта НЕ отменяется: средства не теряются. */}
          <EmptyState
            tone="danger"
            icon={<TriangleAlert size={24} />}
            title={t('close.failed.title')}
            text={t('close.failed.text')}
            action={<Button onClick={() => setStep('destination')}>{t('common.retry')}</Button>}
          />
        </Card>
      </AppShell>
    )
  }

  /* --- Карта закрыта (Б-13) ----------------------------------------------- */
  if (step === 'done') {
    return (
      <AppShell title={t('close.title')}>
        <Card density="flush">
          <EmptyState
            icon={<CircleCheck size={24} />}
            title={t('close.step4.title')}
            text={t('close.step4.text')}
            action={
              <Button
                onClick={() => {
                  finishClosing()
                  router.push('/app')
                }}
              >
                {t('nav.home')}
              </Button>
            }
          />
        </Card>
      </AppShell>
    )
  }

  /* --- Ждём незакрытых авторизаций (Б-11) --------------------------------- */
  if (step === 'waiting') {
    return (
      <AppShell title={t('close.title')} back>
        <div className={styles.stack}>
          <h1 className={styles.title}>{t('close.step3.title')}</h1>
          <p className={styles.text}>
            {t('close.step3.text', {
              amount: `${current.held ?? '0.00'} ${current.currency}`,
              count: current.heldOperations?.length ?? 0,
            })}
          </p>

          {/* Список удерживающих операций обязателен: без него это выглядит
              как «деньги застряли непонятно где». */}
          {current.heldOperations?.length ? (
            <Card>
              <CardHeader title={t('close.step3.held')} />
              <List>
                {current.heldOperations.map((op) => (
                  <OperationRow key={op.id} operation={op} linked={false} />
                ))}
              </List>
            </Card>
          ) : null}
          <div className={styles.footer}>
            <Button variant="secondary" fullWidth onClick={() => router.push(`/app/card/${id}`)}>
              {t('common.back')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  /* --- Шаг 2. Куда переносить остаток ------------------------------------- */
  if (step === 'destination') {
    return (
      <AppShell title={t('close.title')} back>
        <div className={styles.stack}>
          <h1 className={styles.title}>{t('close.step2.title')}</h1>

          {!current.isPrimary ? (
            /* Для дочерней карты выбора нет: остаток уходит на главную. */
            <Toast tone="neutral" title={t('close.step2.child')} />
          ) : child ? (
            <>
              <label
                className={[
                  styles.choice,
                  destination === 'child' ? styles.choiceSelected : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <input
                  type="radio"
                  className={styles.choiceInput}
                  checked={destination === 'child'}
                  onChange={() => setDestination('child')}
                />
                <span className={styles.choiceMark}>
                  {destination === 'child' ? <Check size={12} strokeWidth={3} /> : null}
                </span>
                <span className={styles.choiceBody}>
                  {t('close.step2.toChild', { last4: `•••• ${child.last4}` })}
                </span>
              </label>

              <label
                className={[styles.choice, destination === 'new' ? styles.choiceSelected : null]
                  .filter(Boolean)
                  .join(' ')}
              >
                <input
                  type="radio"
                  className={styles.choiceInput}
                  checked={destination === 'new'}
                  onChange={() => setDestination('new')}
                />
                <span className={styles.choiceMark}>
                  {destination === 'new' ? <Check size={12} strokeWidth={3} /> : null}
                </span>
                <span className={styles.choiceBody}>{t('close.step2.toNew')}</span>
              </label>
            </>
          ) : (
            <Toast tone="neutral" title={t('close.step2.noChild')} />
          )}

          <div className={styles.footer}>
            <Button
              fullWidth
              onClick={() => {
                startClosing(current.id)
                // Если незакрытых авторизаций нет, карта закрывается сразу.
                // Ждать нечего, и выдумывать удержание ради красивого шага
                // мастера нельзя (docs/domain-and-money.md).
                setStep(current.heldOperations?.length ? 'waiting' : 'done')
              }}
            >
              {t('common.confirm')}
            </Button>
          </div>
        </div>
      </AppShell>
    )
  }

  /* --- Шаг 1. Предупреждение и подтверждение ------------------------------ */
  return (
    <AppShell title={t('close.title')} back>
      <div className={styles.stack}>
        <h1 className={styles.title}>{t('close.step1.title', { last4: `•••• ${current.last4}` })}</h1>
        <p className={styles.text}>{t('close.step1.text')}</p>

        {/* Предупреждаем заранее: перевыпуска не существует, новая карта
            получит другой номер, подписки перестанут работать. */}
        <Toast tone="warning" title={t('close.step1.warning')} />

        {/* Необратимое действие подтверждается вводом значения, а не «ОК». */}
        <Input
          label={t('close.step1.confirm')}
          numeric
          placeholder={current.last4}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <div className={styles.footer}>
          <Button
            variant="danger"
            fullWidth
            disabled={confirm !== current.last4}
            onClick={() => setStep('destination')}
          >
            {t('close.step1.action')}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => router.back()}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

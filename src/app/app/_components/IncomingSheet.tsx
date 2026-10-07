'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Undo2 } from 'lucide-react'
import { Amount, Badge, Button, Card, Drawer, List, ListRow } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type { IncomingDeposit } from '@/fixtures/types'
import styles from '../screens.module.css'

/**
 * Поступления, которые система видит прямо сейчас.
 *
 * Транзакцию на крипто-адрес видно до того, как она подтвердится, и
 * показывать её надо сразу: деньги уже ушли с кошелька человека, а на
 * счёте их ещё нет. В этом промежутке и рождается обращение в поддержку
 * «я отправил, где деньги» — отвечать на него должен экран, а не человек.
 *
 * Шторка снизу, а не отдельная страница: это взгляд на ход дела, после
 * которого возвращаются туда же, откуда смотрели.
 *
 * Сначала список строк, подробности — по нажатию. Поступлений может быть
 * несколько, и разворачивать их все сразу значит заставить листать
 * шторку, чтобы найти нужное.
 */

/** Какие шаги уже пройдены при каждом состоянии. */
const DONE: Record<IncomingDeposit['status'], number> = {
  confirming: 0,
  checking: 1,
  credited: 3,
  rejected: 2,
}

/** Цвет точки состояния в строке списка. */
const DOT: Record<IncomingDeposit['status'], string> = {
  confirming: styles.dotWarning!,
  checking: styles.dotWarning!,
  credited: styles.dotSuccess!,
  rejected: styles.dotDanger!,
}

export function IncomingSheet({
  open,
  onClose,
  items,
}: {
  open: boolean
  onClose: () => void
  items: IncomingDeposit[]
}) {
  const { t, locale } = useI18n()
  const router = useRouter()

  /* Какое поступление раскрыто. Шторка всегда открывается списком, даже
     когда поступление одно: так одинаково выглядит и первый раз, и
     когда их станет три. */
  const [openId, setOpenId] = useState<string | null>(null)

  // Шторку открывают заново — начинаем со списка.
  useEffect(() => {
    if (open) setOpenId(null)
  }, [open])

  const current = items.find((i) => i.id === openId)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      title={t('incoming.title')}
      subtitle={current ? undefined : t('incoming.subtitle')}
      /* Кнопки «закрыть» внизу нет: крестик в шапке на месте, а шторка
         закрывается ещё и щелчком мимо. Внизу остаётся только возврат
         к списку — действие, которого больше взять негде. */
      footer={
        current ? (
          <Button variant="secondary" fullWidth onClick={() => setOpenId(null)}>
            {t('common.back')}
          </Button>
        ) : undefined
      }
    >
      {current ? (
        <Details item={current} locale={locale} t={t} onRefund={() => {
          onClose()
          router.push('/app/refund')
        }} />
      ) : (
        <List>
          {items.map((item) => (
            <ListRow
              key={item.id}
              title={`${t('op.type.deposit')} ${item.asset}`}
              subtitle={formatDateTime(locale, item.startedAt)}
              /* Точка и короткая подпись. Цвет ловится взглядом, подпись
                 говорит, что он значит: состояние, переданное одним
                 цветом, для части людей не передано вовсе
                 (docs/prototype.md). */
              trailing={
                <span className={styles.dotRow}>
                  <span className={[styles.dot, DOT[item.status]].join(' ')} aria-hidden />
                  {t(`incoming.status.${item.status}`)}
                </span>
              }
              onClick={() => setOpenId(item.id)}
            />
          ))}
        </List>
      )}
    </Drawer>
  )
}

function Details({
  item,
  locale,
  t,
  onRefund,
}: {
  item: IncomingDeposit
  locale: 'ru' | 'en'
  t: (key: string, params?: Record<string, string | number>) => string
  onRefund: () => void
}) {
  const done = DONE[item.status]
  const rejected = item.status === 'rejected'

  return (
    <Card>
      <div className={styles.stack}>
        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('op.type.deposit')}</span>
            <span className={styles.rowValue}>
              <Amount value={item.amount} currency={item.asset} />
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('topup.network')}</span>
            <span className={styles.rowValue}>
              {item.network} · {item.asset}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('incoming.started')}</span>
            <span className={styles.rowValue}>{formatDateTime(locale, item.startedAt)}</span>
          </div>
        </div>

        <div className={styles.steps}>
          <Step
            done={done > 0}
            title={t('incoming.step.confirming')}
            meta={
              done > 0 ? null : (
                <Badge tone="warning">
                  {t('incoming.confirmations', {
                    now: item.confirmations,
                    need: item.confirmationsNeeded,
                  })}
                </Badge>
              )
            }
          />
          <Step
            done={done > 1}
            title={t('incoming.step.checking')}
            meta={done === 1 ? <Badge tone="warning">{t('op.status.pending')}</Badge> : null}
          />
          <Step
            done={done > 2}
            title={rejected ? t('incoming.step.rejected') : t('incoming.step.credited')}
            meta={
              rejected ? (
                <Badge tone="danger">{t('incoming.rejectedBadge')}</Badge>
              ) : done > 2 ? (
                /* Сумму к зачислению показываем, только когда зачисление
                   действительно произошло: до того она ещё может не
                   состояться. */
                <Amount value={item.net} currency={item.asset} size="caption" />
              ) : null
            }
          />
        </div>
      </div>

      {rejected ? (
        <div className={styles.footer}>
          <p className={styles.note}>{t('incoming.rejectedText')}</p>
          <Button fullWidth iconStart={<Undo2 size={18} />} onClick={onRefund}>
            {t('refund.action')}
          </Button>
        </div>
      ) : (
        <div className={styles.footer}>
          <a className={styles.note} href={item.txLink} target="_blank" rel="noreferrer">
            {t('incoming.openChain')} <ExternalLink size={12} />
          </a>
        </div>
      )}
    </Card>
  )
}

function Step({
  done,
  title,
  meta,
}: {
  done: boolean
  title: string
  meta: React.ReactNode
}) {
  return (
    <div className={styles.step}>
      <span className={[styles.stepMark, done ? styles.stepDone : null].filter(Boolean).join(' ')}>
        {done ? <Check size={12} strokeWidth={3} /> : null}
      </span>
      <span className={styles.stepBody}>
        <span className={styles.stepTitle}>{title}</span>
        {meta ? <span className={styles.stepMeta}>{meta}</span> : null}
      </span>
    </div>
  )
}

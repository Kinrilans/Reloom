'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftRight,
  Eye,
  Snowflake,
  Sun,
  Trash2,
} from 'lucide-react'
import { Badge, Button, Card, CardHeader, List, Toast } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { useStore } from '@/fixtures/store'
import { AppShell } from '../../AppShell'
import { CardFace } from '../../_components/CardFace'
import { OperationRow } from '../../_components/OperationRow'
import styles from '../../screens.module.css'

export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t, locale } = useI18n()
  const router = useRouter()
  const { scenario, card, freeze, unfreeze, cancelClosing } = useStore()

  const current = card(id)
  if (!current) {
    return (
      <AppShell title={t('nav.home')} back>
        <p className={styles.text}>{t('card.canceled.text')}</p>
      </AppShell>
    )
  }

  const frozenByNegative = current.freezeReason === 'NEGATIVE_BALANCE'
  const closing = current.status === 'CLOSING'
  const canceled = current.status === 'CANCELED'
  const quarantined = Boolean(scenario.quarantineUntil)
  const blocked = scenario.profileStatus === 'BLOCKED'
  const operations = scenario.operations.filter((op) => op.cardId === current.id)

  return (
    <AppShell title={`•••• ${current.last4}`} back>
      {/* Доступное показано на самой карте, как на главной: это главное
          число экрана, и ему место там, где на него смотрят. Отдельной
          плитки с ним больше нет — одно и то же число дважды на одном
          экране заставляет искать между ними разницу. */}
      <CardFace card={current} />

      {/* Состояния карты Б-9 … Б-13. */}
      {canceled ? <Toast tone="neutral" title={t('card.canceled.text')} /> : null}

      {frozenByNegative ? (
        /* Кнопку разморозки не показываем вовсе: она заведомо не сработает,
           и человек будет жать её и считать систему сломанной (Б-10). */
        <Toast
          tone="danger"
          title={t('card.status.frozen')}
          text={t('card.frozen.negative.text', {
            amount: `${scenario.shortfall ?? ''} ${scenario.currency}`,
          })}
          actions={
            <Button size="sm" variant="secondary" onClick={() => router.push('/app/topup')}>
              {t('action.topup')}
            </Button>
          }
        />
      ) : null}

      {current.status === 'FROZEN' && !frozenByNegative ? (
        <Toast tone="neutral" title={t('card.status.frozen')} text={t('card.frozen.byUser.text')} />
      ) : null}

      {closing ? (
        <>
          <Toast
            tone="warning"
            title={t('close.step3.title')}
            text={t('close.step3.text', {
              amount: `${current.held ?? '0.00'} ${current.currency}`,
              count: current.heldOperations?.length ?? 0,
            })}
            actions={
              <Button size="sm" variant="secondary" onClick={() => cancelClosing(current.id)}>
                {t('close.step3.return')}
              </Button>
            }
          />
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
        </>
      ) : null}

      {quarantined ? (
        <Toast
          tone="warning"
          title={t('profile.quarantine.title')}
          text={t('secrets.quarantine', {
            until: formatDateTime(locale, scenario.quarantineUntil!),
          })}
        />
      ) : null}

      <Card>
        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('card.expires')}</span>
            <span className={styles.rowValue}>{current.expires}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('op.detail.card')}</span>
            <span className={styles.rowValue}>
              <Badge tone={current.isPrimary ? 'brand' : 'neutral'}>
                {current.isPrimary ? t('card.primary') : t('card.child')}
              </Badge>
            </span>
          </div>
        </div>
      </Card>

      {!canceled ? (
        <Card density="dense">
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.actionRow}
              disabled={quarantined || blocked}
              onClick={() => router.push(`/app/card/${current.id}/secrets`)}
            >
              <Eye className={styles.actionIcon} size={20} />
              <span className={styles.actionLabel}>{t('card.show')}</span>
            </button>

            <button
              type="button"
              className={styles.actionRow}
              disabled={blocked || closing}
              onClick={() => router.push('/app/transfer')}
            >
              <ArrowLeftRight className={styles.actionIcon} size={20} />
              <span className={styles.actionLabel}>{t('action.transfer')}</span>
            </button>

            {/* Заморозка — мгновенно, без подтверждения: это защитное
                действие, мешать ему нельзя. Разморозка — с подтверждением. */}
            {current.status === 'ACTIVE' ? (
              <button
                type="button"
                className={styles.actionRow}
                disabled={blocked}
                onClick={() => freeze(current.id, 'BY_USER')}
              >
                <Snowflake className={styles.actionIcon} size={20} />
                <span className={styles.actionLabel}>{t('card.freeze')}</span>
              </button>
            ) : null}

            {current.status === 'FROZEN' && !frozenByNegative ? (
              <button
                type="button"
                className={styles.actionRow}
                disabled={blocked}
                onClick={() => unfreeze(current.id)}
              >
                <Sun className={styles.actionIcon} size={20} />
                <span className={styles.actionLabel}>{t('card.unfreeze')}</span>
              </button>
            ) : null}

            {!closing ? (
              <button
                type="button"
                className={[styles.actionRow, styles.actionDanger].join(' ')}
                disabled={blocked}
                onClick={() => router.push(`/app/card/${current.id}/close`)}
              >
                <Trash2 className={styles.actionIcon} size={20} />
                <span className={styles.actionLabel}>{t('card.close')}</span>
              </button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {operations.length > 0 ? (
        <Card>
          <CardHeader title={t('card.operations')} />
          <List>
            {operations.map((op) => (
              <OperationRow key={op.id} operation={op} />
            ))}
          </List>
        </Card>
      ) : null}
    </AppShell>
  )
}

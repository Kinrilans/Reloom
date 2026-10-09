'use client'

import { Inbox, Snowflake } from 'lucide-react'
import {
  Amount,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/ui'
import type { SelectOption } from '@/ui'
import { useI18n } from '@/i18n'
import type { CardDetail, CardFilter, CardKind, CardRow } from '@/server/admin/cards'
import { AdminShell } from '../AdminShell'
import { useAdmin } from '../_store/AdminStore'
import { Pager } from '../_components/Pager'
import { useListParams } from '../_components/useListParams'
import { CardDrawer } from './_components/CardDrawer'
import styles from '../admin.module.css'

const STATUS_KEYS: { value: CardFilter; key: string }[] = [
  { value: 'all', key: 'admin.cards.status.all' },
  { value: 'ACTIVE', key: 'admin.cards.status.active' },
  { value: 'FROZEN', key: 'admin.cards.status.frozen' },
  { value: 'CLOSING', key: 'admin.cards.status.closing' },
  { value: 'CANCELED', key: 'admin.cards.status.canceled' },
]

const TYPE_KEYS: { value: CardKind; key: string }[] = [
  { value: 'all', key: 'admin.cards.type.all' },
  { value: 'primary', key: 'admin.cards.type.primary' },
  { value: 'child', key: 'admin.cards.type.child' },
]

export function CardsScreen({
  rows,
  total,
  page,
  pageSize,
  status,
  kind,
  open,
}: {
  rows: CardRow[]
  total: number
  page: number
  pageSize: number
  status: CardFilter
  kind: CardKind
  open: CardDetail | null
}) {
  const { t } = useI18n()
  const { isAllCompanies } = useAdmin()
  const params = useListParams()

  const statusOptions: SelectOption[] = STATUS_KEYS.map((option) => ({
    value: option.value,
    label: t(option.key),
  }))
  const typeOptions: SelectOption[] = TYPE_KEYS.map((option) => ({
    value: option.value,
    label: t(option.key),
  }))

  return (
    <AdminShell title={t('admin.cards.title')} note={t('admin.cards.note')}>
      <div className={styles.filters}>
        <div className={styles.filterGrow}>
          <Input
            label={t('admin.filter.search')}
            placeholder={t('admin.cards.searchPlaceholder2')}
            defaultValue={params.get('q')}
            onChange={(e) => params.set({ q: e.target.value })}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.col.status')}
            options={statusOptions}
            value={status}
            onChange={(next) => params.set({ status: next })}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.col.type')}
            options={typeOptions}
            value={kind}
            onChange={(next) => params.set({ kind: next })}
          />
        </div>
      </div>

      <Card density="flush">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={24} />}
            title={t('admin.cards.emptyTitle')}
            text={t('admin.cards.emptyText')}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('admin.col.card')}</TH>
                <TH>{t('admin.col.user')}</TH>
                {isAllCompanies ? <TH>{t('admin.col.company')}</TH> : null}
                <TH>{t('admin.col.type')}</TH>
                <TH>{t('admin.col.status')}</TH>
                <TH align="numeric">{t('admin.col.applied')}</TH>
                <TH align="numeric">{t('admin.col.spent')}</TH>
                <TH align="numeric">{t('admin.col.available')}</TH>
                <TH align="numeric">{t('admin.col.held')}</TH>
                <TH align="actions">{t('admin.col.action')}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((card) => (
                <TR
                  key={card.id}
                  flagged={card.status === 'CLOSING'}
                  onClick={() => params.set({ open: card.id })}
                >
                  <TD primary>•••• {card.last4 ?? '????'}</TD>
                  <TD>{card.userName}</TD>
                  {isAllCompanies ? <TD muted>{card.companyName}</TD> : null}
                  <TD>
                    <Badge tone={card.isPrimary ? 'brand' : 'neutral'}>
                      {card.isPrimary ? t('admin.card.primary') : t('admin.card.child')}
                    </Badge>
                  </TD>
                  <TD>
                    {card.status === 'ACTIVE' ? (
                      <Badge tone="success">{t('admin.card.active')}</Badge>
                    ) : card.status === 'CLOSING' ? (
                      <Badge tone="warning">{t('admin.card.closing')}</Badge>
                    ) : card.status === 'CANCELED' ? (
                      <Badge tone="neutral">{t('admin.card.canceled')}</Badge>
                    ) : (
                      <Badge tone="warning" icon={<Snowflake size={12} />} dot={false}>
                        {card.freezeReason === 'NEGATIVE_BALANCE'
                          ? t('admin.card.frozenNegative')
                          : t('admin.card.frozen')}
                      </Badge>
                    )}
                  </TD>
                  <TD align="numeric">
                    <Amount value={card.applied} currency="USD" size="caption" />
                  </TD>
                  <TD align="numeric">
                    <Amount value={card.spent} currency="USD" size="caption" />
                  </TD>
                  <TD align="numeric">
                    <Amount value={card.available} currency="USD" size="caption" />
                  </TD>
                  <TD align="numeric" muted>
                    <Amount value={card.held} currency="USD" size="caption" />
                  </TD>
                  <TD align="actions">
                    <div className={styles.actionsCell}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => params.set({ open: card.id })}
                      >
                        {t('admin.action.open')}
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Pager page={page} pageSize={pageSize} total={total} onPage={params.setPage} />

      <CardDrawer card={open} onClose={() => params.set({ open: '' })} />
    </AdminShell>
  )
}

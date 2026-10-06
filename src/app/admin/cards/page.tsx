'use client'

import { useEffect, useState } from 'react'
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
import { CARDS, companyName } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from '../AdminShell'
import { Pager, pageSlice } from '../_components/Pager'
import { CardDrawer } from './_components/CardDrawer'
import styles from '../admin.module.css'

const PAGE_SIZE = 20

const STATUS_KEYS: { value: string; key: string }[] = [
  { value: 'all', key: 'admin.cards.status.all' },
  { value: 'ACTIVE', key: 'admin.cards.status.active' },
  { value: 'FROZEN', key: 'admin.cards.status.frozen' },
  { value: 'CLOSING', key: 'admin.cards.status.closing' },
  { value: 'CANCELED', key: 'admin.cards.status.canceled' },
]

const TYPE_KEYS: { value: string; key: string }[] = [
  { value: 'all', key: 'admin.cards.type.all' },
  { value: 'primary', key: 'admin.cards.type.primary' },
  { value: 'child', key: 'admin.cards.type.child' },
]

export default function CardsPage() {
  const { t } = useI18n()
  const { byCompany, isAllCompanies } = useAdmin()

  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  /* Карточка открывается панелью поверх списка: фильтры, страница и
     прокрутка остаются на месте. */
  const [openId, setOpenId] = useState<string | null>(null)

  // Дашборд ведёт сюда с применённым фильтром, карточка пользователя —
  // с открытой картой: ?open=card-…
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    if (query.get('filter') === 'closing') setStatus('CLOSING')
    const open = query.get('open')
    if (open) setOpenId(open)
  }, [])

  const filtered = byCompany(CARDS)
    .filter((c) => (status === 'all' ? true : c.status === status))
    .filter((c) => (type === 'all' ? true : type === 'primary' ? c.isPrimary : !c.isPrimary))
    .filter((c) => {
      const q = query.trim().toLowerCase()
      return q.length === 0 || c.last4.includes(q) || c.userName.toLowerCase().includes(q)
    })

  const rows = pageSlice(filtered, page, PAGE_SIZE)

  const statusOptions: SelectOption[] = STATUS_KEYS.map((o) => ({ value: o.value, label: t(o.key) }))
  const typeOptions: SelectOption[] = TYPE_KEYS.map((o) => ({ value: o.value, label: t(o.key) }))

  return (
    <AdminShell
      title={t('admin.cards.title')}
      note={t('admin.cards.note')}
    >
      <div className={styles.filters}>
        <div className={styles.filterGrow}>
          <Input
            label={t('admin.filter.search')}
            placeholder={t('admin.cards.searchPlaceholder2')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </div>
        <div className={styles.filter}>
          <Select label={t('admin.col.status')} options={statusOptions} value={status} onChange={(v) => { setStatus(v); setPage(0) }} />
        </div>
        <div className={styles.filter}>
          <Select label={t('admin.col.type')} options={typeOptions} value={type} onChange={(v) => { setType(v); setPage(0) }} />
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
                  onClick={() => setOpenId(card.id)}
                >
                  <TD primary>•••• {card.last4}</TD>
                  <TD>{card.userName}</TD>
                  {isAllCompanies ? <TD muted>{companyName(card.companyId)}</TD> : null}
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
                    {card.held ? <Amount value={card.held} currency="USD" size="caption" /> : '—'}
                  </TD>
                  <TD align="actions">
                    <div className={styles.actionsCell}>
                      <Button variant="ghost" size="sm" onClick={() => setOpenId(card.id)}>
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

      <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />

      <CardDrawer cardId={openId} onClose={() => setOpenId(null)} />
    </AdminShell>
  )
}

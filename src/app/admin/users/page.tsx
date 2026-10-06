'use client'

import { useEffect, useState } from 'react'
import { Download, Inbox, UserPlus } from 'lucide-react'
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
import type { BadgeTone, SelectOption } from '@/ui'
import { useI18n } from '@/i18n'
import { USERS, companyName } from '@/fixtures/admin'
import type { AdminUser, OxenStatus } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from '../AdminShell'
import { Pager, pageSlice } from '../_components/Pager'
import { NewUserModal } from './_components/NewUserModal'
import { UserDrawer } from './_components/UserDrawer'
import styles from '../admin.module.css'

const PAGE_SIZE = 20

/** По умолчанию показываются только активные. Заблокированные — через
 *  фильтр, и в списке помечены явно: оператор не должен принять
 *  заблокированного за действующего. */
const STATUS_KEYS: { value: string; key: string }[] = [
  { value: 'ACTIVE', key: 'admin.users.status.active' },
  { value: 'BLOCKED', key: 'admin.users.status.blocked' },
  { value: 'negative', key: 'admin.users.status.negative' },
  { value: 'stuck', key: 'admin.users.status.stuck' },
  { value: 'all', key: 'admin.filter.all' },
]

const OXEN_TONE: Record<string, BadgeTone> = {
  APPROVED: 'success',
  PENDING: 'warning',
  NEEDS_REVIEW: 'danger',
  REJECTED: 'danger',
  none: 'neutral',
}

function matches(user: AdminUser, status: string): boolean {
  if (status === 'all') return true
  if (status === 'negative') return user.negative
  if (status === 'stuck') return user.oxenStatus === 'NEEDS_REVIEW' || user.oxenStatus === 'REJECTED'
  return user.status === status
}

export default function UsersPage() {
  const { t } = useI18n()
  const { byCompany, isAllCompanies, can } = useAdmin()

  const [status, setStatus] = useState('ACTIVE')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  /* Карточка открывается панелью поверх списка: фильтры, страница и
     прокрутка остаются на месте. */
  const [openId, setOpenId] = useState<string | null>(null)

  // Пункты дашборда ведут сюда с применённым фильтром, а ссылки с других
  // экранов — с открытой карточкой: ?open=usr-…
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const preset = query.get('filter')
    if (preset === 'negative' || preset === 'stuck') setStatus(preset)
    const open = query.get('open')
    if (open) {
      setStatus('all')
      setOpenId(open)
    }
  }, [])

  const filtered = byCompany(USERS)
    .filter((u) => matches(u, status))
    .filter((u) => u.name.toLowerCase().includes(query.trim().toLowerCase()))

  const rows = pageSlice(filtered, page, PAGE_SIZE)

  const statusOptions: SelectOption[] = STATUS_KEYS.map((o) => ({
    value: o.value,
    label: t(o.key),
  }))

  function oxenBadge(oxen: OxenStatus) {
    const code = oxen ?? 'none'
    return <Badge tone={OXEN_TONE[code] ?? 'neutral'}>{t(`admin.oxen.${code}`)}</Badge>
  }

  return (
    <AdminShell
      title={t('admin.users.title')}
      note={t('admin.users.note')}
      action={
        can('MANAGE_USERS') ? (
          <Button iconStart={<UserPlus size={18} />} onClick={() => setCreating(true)}>
            {t('admin.users.create')}
          </Button>
        ) : null
      }
    >
      <div className={styles.filters}>
        <div className={styles.filterGrow}>
          <Input
            label={t('admin.users.searchLabel')}
            placeholder={t('admin.users.searchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.col.status')}
            options={statusOptions}
            value={status}
            onChange={(next) => {
              setStatus(next)
              setPage(0)
            }}
          />
        </div>
        <div className={styles.filterActions}>
          <Button variant="secondary" iconStart={<Download size={16} />}>
            {t('admin.action.exportCsv')}
          </Button>
        </div>
      </div>

      <Card density="flush">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={24} />}
            title={t('admin.users.emptyTitle')}
            text={t('admin.users.emptyText')}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('admin.col.name')}</TH>
                {isAllCompanies ? <TH>{t('admin.col.company')}</TH> : null}
                <TH>{t('admin.col.status')}</TH>
                <TH align="numeric">{t('admin.col.balance')}</TH>
                <TH align="numeric">{t('admin.col.cards')}</TH>
                <TH>{t('admin.col.oxenStatus')}</TH>
                <TH align="actions">{t('admin.col.action')}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((user) => (
                <TR
                  key={user.id}
                  flagged={user.negative}
                  onClick={() => setOpenId(user.id)}
                >
                  <TD primary>{user.name}</TD>
                  {isAllCompanies ? <TD muted>{companyName(user.companyId)}</TD> : null}
                  <TD>
                    {user.status === 'BLOCKED' ? (
                      <Badge tone="neutral">{t('admin.users.badge.blocked')}</Badge>
                    ) : user.negative ? (
                      <Badge tone="danger">{t('admin.users.badge.negative')}</Badge>
                    ) : (
                      <Badge tone="success">{t('admin.users.badge.active')}</Badge>
                    )}
                  </TD>
                  <TD align="numeric">
                    <Amount value={user.balance} currency="USD" size="caption" />
                  </TD>
                  <TD align="numeric" muted>
                    {user.cards}
                  </TD>
                  <TD>{oxenBadge(user.oxenStatus)}</TD>
                  <TD align="actions">
                    <div className={styles.actionsCell}>
                      <Button variant="ghost" size="sm" onClick={() => setOpenId(user.id)}>
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

      <NewUserModal open={creating} onClose={() => setCreating(false)} />
      <UserDrawer userId={openId} onClose={() => setOpenId(null)} />
    </AdminShell>
  )
}

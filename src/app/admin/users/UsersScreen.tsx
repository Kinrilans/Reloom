'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
import type { UserCardView, UserFilter, UserRow } from '@/server/admin/users'
import { AdminShell } from '../AdminShell'
import { useAdmin } from '../_store/AdminStore'
import { Pager } from '../_components/Pager'
import { useListParams } from '../_components/useListParams'
import { NewUserModal } from './_components/NewUserModal'
import { UserDrawer } from './_components/UserDrawer'
import styles from '../admin.module.css'

/** По умолчанию показываются только активные. Заблокированные —
 *  через фильтр и помечены в списке явно. */
const STATUS_KEYS: { value: UserFilter; key: string }[] = [
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
  NEEDS_INFO: 'danger',
  REJECTED: 'danger',
  none: 'neutral',
}

export function UsersScreen({
  rows,
  total,
  page,
  pageSize,
  filter,
  open,
  companies,
  globalFees,
}: {
  rows: UserRow[]
  total: number
  page: number
  pageSize: number
  filter: UserFilter
  open: UserCardView | null
  companies: { id: string; name: string }[]
  globalFees: { depositBps: number; withdrawalBps: number }
}) {
  const { t } = useI18n()
  const { isAllCompanies, can } = useAdmin()
  const params = useListParams()
  const search = useSearchParams()
  const [creating, setCreating] = useState(false)

  const statusOptions: SelectOption[] = STATUS_KEYS.map((option) => ({
    value: option.value,
    label: t(option.key),
  }))

  function oxenBadge(status: string | null) {
    const code = status ?? 'none'
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
            defaultValue={params.get('q')}
            onChange={(e) => params.set({ q: e.target.value })}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.col.status')}
            options={statusOptions}
            value={filter}
            onChange={(next) => params.set({ filter: next })}
          />
        </div>
        <div className={styles.filterActions}>
          {/* Выгрузка уходит тем же отбором, что на экране. */}
          <Button
            variant="secondary"
            iconStart={<Download size={16} />}
            onClick={() => {
              window.location.href = `/admin/users/export?${search.toString()}`
            }}
          >
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
                  onClick={() => params.set({ open: user.id })}
                >
                  <TD primary>{user.name}</TD>
                  {isAllCompanies ? <TD muted>{user.companyName}</TD> : null}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => params.set({ open: user.id })}
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

      <NewUserModal
        open={creating}
        companies={companies}
        onClose={() => setCreating(false)}
        onCreated={(userId) => {
          setCreating(false)
          // Созданный пользователь открывается сразу: следующий шаг —
          // завести его у эмитента, и искать его в списке незачем.
          params.set({ open: userId, filter: 'all' })
        }}
      />

      <UserDrawer
        user={open}
        globalFees={globalFees}
        onClose={() => params.set({ open: '' })}
      />
    </AdminShell>
  )
}

'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Flame, Wallet } from 'lucide-react'
import {
  AssetIcon,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Toast,
} from '@/ui'
import type { SelectOption } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type { AddressFilter, AddressRow } from '@/server/admin/addresses'
import { AdminShell } from '../AdminShell'
import { useAdmin } from '../_store/AdminStore'
import { Pager } from '../_components/Pager'
import { useListParams } from '../_components/useListParams'
import { burnAddressAction } from './actions'
import styles from '../admin.module.css'

/**
 * Крипто-адреса пользователей.
 *
 * Уничтожение необратимо и потому с подтверждением: уничтоженный
 * адрес не выдаётся заново никогда — он уже засвечен, и следующее
 * поступление на него тянуло бы за собой ту же историю. Из таблицы
 * адрес при этом не исчезает: прошлые поступления обязаны
 * объясняться.
 *
 * Адрес в строке показан началом и концом. Целиком он ломает колонку
 * в столбик из букв, а сверяют его всё равно по краям: середина
 * у адресов одной сети выглядит одинаково. Полный адрес — в подсказке
 * и в окне уничтожения, где его и перечитывают.
 */

const STATUS_KEYS: { value: AddressFilter; key: string }[] = [
  { value: 'ACTIVE', key: 'admin.addresses.status.active' },
  { value: 'BURNED', key: 'admin.addresses.status.burned' },
  { value: 'all', key: 'admin.tx.status.all' },
]

/** Коды причин уничтожения приходят из базы, подпись — из словаря. */
const REASON_KEY: Record<string, string> = {
  REFUNDED: 'afterRefund',
  COMPROMISED: 'byOperator',
}

export function AddressesScreen({
  rows,
  total,
  page,
  pageSize,
  status,
  networks,
}: {
  rows: AddressRow[]
  total: number
  page: number
  pageSize: number
  status: AddressFilter
  networks: { id: string; name: string; asset: string; iconUrl: string | null }[]
}) {
  const { locale, t } = useI18n()
  const { can, isAllCompanies } = useAdmin()
  const params = useListParams()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [burning, setBurning] = useState<AddressRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mayManage = can('MANAGE_ADDRESSES')

  const statusOptions: SelectOption[] = STATUS_KEYS.map((option) => ({
    value: option.value,
    label: t(option.key),
  }))

  const networkOptions: SelectOption[] = [
    { value: '', label: t('admin.addresses.allNetworks') },
    ...networks.map((network) => ({
      value: network.id,
      label: `${network.name} · ${network.asset}`,
      icon: <AssetIcon asset={network.asset} src={network.iconUrl} />,
    })),
  ]

  function burn() {
    if (!burning) return
    setError(null)
    startTransition(async () => {
      const result = await burnAddressAction(burning.id)
      if (!result.ok) {
        setError(result.error ?? 'error')
        return
      }
      setBurning(null)
      router.refresh()
    })
  }

  return (
    <AdminShell title={t('admin.addresses.title')} note={t('admin.addresses.note')}>
      <div className={styles.filters}>
        <div className={styles.filterGrow}>
          <Input
            label={t('admin.addresses.searchLabel')}
            placeholder={t('admin.addresses.searchPlaceholder')}
            defaultValue={params.get('q')}
            onChange={(e) => params.set({ q: e.target.value })}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.addresses.col.network')}
            options={networkOptions}
            value={params.get('network')}
            onChange={(next) => params.set({ network: next })}
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
      </div>

      {error ? <Toast tone="danger" title={error} /> : null}

      <Card density="flush">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Wallet size={24} />}
            title={t('admin.addresses.emptyTitle')}
            text={t('admin.addresses.emptyText')}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('admin.addresses.col.address')}</TH>
                <TH>{t('admin.col.user')}</TH>
                {isAllCompanies ? <TH>{t('admin.col.company')}</TH> : null}
                <TH>{t('admin.addresses.col.network')}</TH>
                <TH align="numeric">{t('admin.addresses.col.deposits')}</TH>
                <TH>{t('admin.addresses.col.last')}</TH>
                <TH>{t('admin.col.status')}</TH>
                <TH align="actions">{t('admin.col.action')}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id} flagged={row.amlVerdict === 'FAILED'}>
                  <TD>
                    <span className={styles.monoRow} title={row.address}>
                      {row.short}
                    </span>
                  </TD>
                  <TD primary>
                    <Link href={`/admin/users?open=${row.userId}&filter=all`}>{row.userName}</Link>
                  </TD>
                  {isAllCompanies ? <TD muted>{row.companyName}</TD> : null}
                  <TD muted>
                    <span className={styles.networkTitle}>
                      <AssetIcon asset={row.asset} src={null} />
                      {row.network} · {row.asset}
                    </span>
                  </TD>
                  <TD align="numeric">{row.deposits}</TD>
                  <TD muted>
                    {row.lastDepositAt ? formatDateTime(locale, row.lastDepositAt) : '—'}
                  </TD>
                  <TD>
                    <div className={styles.statusBlock}>
                      <Badge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {row.status === 'ACTIVE'
                          ? t('admin.addresses.status.active')
                          : t('admin.addresses.status.burned')}
                      </Badge>
                      {row.burnReasonCode ? (
                        <span className={styles.company}>
                          {t(
                            `admin.addresses.reason.${REASON_KEY[row.burnReasonCode] ?? 'byOperator'}`,
                          )}
                        </span>
                      ) : null}
                    </div>
                  </TD>
                  <TD align="actions">
                    <div className={styles.actionsCell}>
                      {mayManage && row.status === 'ACTIVE' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          iconStart={<Flame size={16} />}
                          onClick={() => setBurning(row)}
                        >
                          {t('admin.addresses.burn')}
                        </Button>
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Pager page={page} pageSize={pageSize} total={total} onPage={params.setPage} />

      {/* --- Уничтожение адреса ----------------------------------------- */}
      <Modal
        open={burning !== null}
        onClose={() => setBurning(null)}
        title={t('admin.addresses.burnTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBurning(null)}>
              {t('admin.networks.cancel')}
            </Button>
            <Button variant="danger" disabled={pending} onClick={burn}>
              {t('admin.addresses.burn')}
            </Button>
          </>
        }
      >
        {burning ? (
          <div className={styles.stack}>
            {error ? <Toast tone="danger" title={error} /> : null}
            <Toast
              tone="danger"
              title={t('admin.addresses.burnWarnTitle')}
              text={t('admin.addresses.burnWarnText', { name: burning.userName })}
            />
            <p className={styles.mono}>{burning.address}</p>
            {burning.memo ? <p className={styles.mono}>memo: {burning.memo}</p> : null}
          </div>
        ) : null}
      </Modal>
    </AdminShell>
  )
}

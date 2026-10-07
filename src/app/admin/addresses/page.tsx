'use client'

import { useState } from 'react'
import Link from 'next/link'
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
import { CRYPTO_ADDRESSES, NETWORKS, companyName } from '@/fixtures/admin'
import type { CryptoAddress } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from '../AdminShell'
import { Pager, pageSlice } from '../_components/Pager'
import styles from '../admin.module.css'

/**
 * Крипто-адреса пользователей.
 *
 * Адрес выдаётся пользователю и закрепляется за ним: по поступлению
 * система знает, чей это платёж, и зачисляет без оператора. Общих
 * адресов «на всех» больше нет — по такому адресу отправителя не
 * отличить, и автоматическое зачисление на нём невозможно.
 *
 * Оператор адреса не заводит. Ему нужно другое: найти адрес по
 * пользователю, увидеть, что на него приходило, и — в крайнем случае —
 * уничтожить адрес.
 *
 * Уничтожение необратимо и потому с подтверждением. Уничтоженный адрес
 * не выдаётся заново никогда: он уже засвечен, и следующее поступление
 * на него тянуло бы за собой ту же историю. Из таблицы адрес при этом
 * не исчезает — прошлые поступления обязаны объясняться.
 */

const PAGE_SIZE = 12

/**
 * Адрес в строке таблицы — началом и концом.
 *
 * Целиком он здесь не помещается и ломает колонку в столбик из букв.
 * Сверяют адрес всё равно по краям: середина у адресов одной сети
 * выглядит одинаково, а подмена видна по началу и хвосту. Полный адрес
 * лежит в подсказке и в окне уничтожения, где его и перечитывают.
 */
function shortAddress(address: string): string {
  if (address.length <= 18) return address
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

const STATUS_KEYS = [
  { value: 'ACTIVE', key: 'admin.addresses.status.active' },
  { value: 'BURNED', key: 'admin.addresses.status.burned' },
  { value: 'all', key: 'admin.tx.status.all' },
]

export default function AddressesPage() {
  const { locale, t } = useI18n()
  const { byCompany, can, isAllCompanies } = useAdmin()
  const mayManage = can('MANAGE_ADDRESSES')

  const [rowsState, setRowsState] = useState<CryptoAddress[]>(CRYPTO_ADDRESSES)
  const [status, setStatus] = useState('ACTIVE')
  const [network, setNetwork] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [burning, setBurning] = useState<CryptoAddress | null>(null)

  const filtered = byCompany(rowsState)
    .filter((a) => (status === 'all' ? true : a.status === status))
    .filter((a) => (network === 'all' ? true : a.networkId === network))
    .filter((a) => {
      const q = query.trim().toLowerCase()
      if (q.length === 0) return true
      // Ищут и по человеку, и по адресу: адрес приходит в обращении
      // от пользователя целой строкой.
      return a.userName.toLowerCase().includes(q) || a.address.toLowerCase().includes(q)
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const rows = pageSlice(filtered, page, PAGE_SIZE)

  const statusOptions: SelectOption[] = STATUS_KEYS.map((o) => ({
    value: o.value,
    label: t(o.key),
  }))

  const networkOptions: SelectOption[] = [
    { value: 'all', label: t('admin.addresses.allNetworks') },
    ...NETWORKS.map((n) => ({
      value: n.id,
      label: `${n.name} · ${n.asset}`,
      icon: <AssetIcon asset={n.asset} src={n.iconUrl} />,
    })),
  ]

  function burn() {
    if (!burning) return
    setRowsState(
      rowsState.map((a) =>
        a.id === burning.id ? { ...a, status: 'BURNED', burnReasonCode: 'byOperator' } : a,
      ),
    )
    setBurning(null)
  }

  return (
    <AdminShell title={t('admin.addresses.title')} note={t('admin.addresses.note')}>
      <div className={styles.filters}>
        <div className={styles.filterGrow}>
          <Input
            label={t('admin.addresses.searchLabel')}
            placeholder={t('admin.addresses.searchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </div>
        <div className={styles.filter}>
          <Select
            label={t('admin.addresses.col.network')}
            options={networkOptions}
            value={network}
            onChange={(next) => {
              setNetwork(next)
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
      </div>

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
              {rows.map((a) => (
                <TR key={a.id} flagged={a.amlVerdict === 'fail'}>
                  <TD>
                    <span className={styles.monoRow} title={a.address}>
                      {shortAddress(a.address)}
                    </span>
                  </TD>
                  <TD primary>
                    <Link href={`/admin/users/${a.userId}`}>{a.userName}</Link>
                  </TD>
                  {isAllCompanies ? <TD muted>{companyName(a.companyId)}</TD> : null}
                  <TD muted>
                    <span className={styles.networkTitle}>
                      <AssetIcon asset={a.asset} src={null} />
                      {a.network} · {a.asset}
                    </span>
                  </TD>
                  <TD align="numeric">{a.deposits}</TD>
                  <TD muted>{a.lastDepositAt ? formatDateTime(locale, a.lastDepositAt) : '—'}</TD>
                  <TD>
                    <div className={styles.statusBlock}>
                      <Badge tone={a.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {a.status === 'ACTIVE'
                          ? t('admin.addresses.status.active')
                          : t('admin.addresses.status.burned')}
                      </Badge>
                      {a.burnReasonCode ? (
                        <span className={styles.company}>
                          {t(`admin.addresses.reason.${a.burnReasonCode}`)}
                        </span>
                      ) : null}
                    </div>
                  </TD>
                  <TD align="actions">
                    <div className={styles.actionsCell}>
                      {mayManage && a.status === 'ACTIVE' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          iconStart={<Flame size={16} />}
                          onClick={() => setBurning(a)}
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

      <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />

      {/* --- Уничтожение адреса --------------------------------------------- */}
      <Modal
        open={burning !== null}
        onClose={() => setBurning(null)}
        title={t('admin.addresses.burnTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBurning(null)}>
              {t('admin.networks.cancel')}
            </Button>
            <Button variant="danger" onClick={burn}>
              {t('admin.addresses.burn')}
            </Button>
          </>
        }
      >
        {burning ? (
          <div className={styles.stack}>
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

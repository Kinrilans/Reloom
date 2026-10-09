'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, RefreshCw, Wallet } from 'lucide-react'
import {
  AssetIcon,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ImageField,
  Input,
  Modal,
  Switch,
  Toast,
} from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type { NetworkView } from '@/server/admin/settings'
import { AdminShell } from '../../AdminShell'
import { useAdmin } from '../../_store/AdminStore'
import { saveNetworkAction, syncNetworksAction, toggleNetworkAction } from './actions'
import styles from '../../admin.module.css'

/**
 * Сети и монеты.
 *
 * Закрытая пара исчезает из выбора у пользователей, но остаётся
 * в истории прошлых поступлений и в реестре адресов — поэтому она
 * выключается, а не удаляется.
 *
 * Значок читается в `data:`-строку прямо здесь и уходит на сервер
 * вместе с остальными правками: отдельного хранилища файлов у нас
 * нет, а значок — это десятки килобайт, которые незачем превращать
 * в инфраструктуру. Предел размера проверяет сервер.
 */

interface Draft {
  id: string
  minDeposit: string
  minDepositOn: boolean
  icon: string | null
  /** Значок меняли в этом окне — только тогда его и отправляем. */
  iconTouched: boolean
}

export function NetworksScreen({
  networks,
  syncedAt,
}: {
  networks: NetworkView[]
  syncedAt: string | null
}) {
  const { locale, t } = useI18n()
  const { can } = useAdmin()
  const router = useRouter()
  const maySettings = can('MANAGE_SETTINGS')

  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const editing = draft ? networks.find((network) => network.id === draft.id) : undefined

  function openEdit(network: NetworkView) {
    setDraft({
      id: network.id,
      minDeposit: network.minDeposit ?? '',
      minDepositOn: network.minDepositOn,
      icon: network.iconUrl,
      iconTouched: false,
    })
  }

  function pickIcon(file: File | null) {
    if (!draft) return
    if (!file) {
      setDraft({ ...draft, icon: null, iconTouched: true })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setDraft((current) =>
        current ? { ...current, icon: String(reader.result), iconTouched: true } : current,
      )
    }
    reader.readAsDataURL(file)
  }

  function save() {
    if (!draft) return
    setError(null)
    startTransition(async () => {
      const result = await saveNetworkAction({
        networkId: draft.id,
        minDepositOn: draft.minDepositOn,
        minDeposit: draft.minDeposit,
        ...(draft.iconTouched ? { icon: draft.icon } : {}),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDraft(null)
      router.refresh()
    })
  }

  function toggle(networkId: string, isActive: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await toggleNetworkAction(networkId, isActive)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function sync() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await syncNetworksAction()
      if (!result.ok) {
        setError(result.error)
        return
      }
      setNotice(t('admin.networks.syncedNotice', { added: result.added, updated: result.updated }))
      router.refresh()
    })
  }

  return (
    <AdminShell title={t('admin.networks.title')} note={t('admin.networks.note')}>
      {!maySettings ? (
        <Toast
          tone="neutral"
          title={t('admin.networks.readOnlyTitle')}
          text={t('admin.networks.readOnlyText')}
        />
      ) : null}

      {error ? <Toast tone="danger" title={error} /> : null}
      {notice ? <Toast tone="success" title={notice} onClose={() => setNotice(null)} /> : null}

      <Toast
        tone="neutral"
        title={t('admin.networks.whereTitle')}
        text={t('admin.networks.whereText')}
      />

      {/* Список пар приходит от сервиса, который выдаёт адреса:
          открывать у себя сеть, которой он не умеет, бессмысленно —
          адрес в ней никто не выдаст. Значок монеты тоже берём оттуда,
          если сервис его отдаёт; загрузка вручную остаётся на случай,
          когда нет. */}
      <Card density="dense">
        <CardHeader
          title={t('admin.networks.sourceTitle')}
          subtitle={t('admin.networks.sourceText')}
          action={
            maySettings ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                iconStart={<RefreshCw size={16} />}
                onClick={sync}
              >
                {t('admin.networks.refresh')}
              </Button>
            ) : undefined
          }
        />
        <p className={styles.kpiHint}>
          {syncedAt
            ? t('admin.networks.syncedAt', { at: formatDateTime(locale, syncedAt) })
            : t('admin.networks.neverSynced')}
        </p>
      </Card>

      {networks.length === 0 ? (
        <Card density="flush">
          <EmptyState
            icon={<Wallet size={24} />}
            title={t('admin.networks.emptyTitle')}
            text={t('admin.networks.emptyText')}
          />
        </Card>
      ) : (
        <div className={styles.grid3}>
          {networks.map((network) => (
            <Card density="dense" key={network.id}>
              <CardHeader
                /* Значок у названия пары, а не у каждого адреса:
                   монета общая на всю пару. */
                title={
                  <span className={styles.networkTitle}>
                    <AssetIcon asset={network.asset} src={network.iconUrl} />
                    {network.name} · {network.asset}
                  </span>
                }
                subtitle={
                  network.requiresMemo
                    ? t('admin.networks.requiresMemo')
                    : t('admin.networks.noMemo')
                }
                action={
                  <Badge tone={network.isActive ? 'success' : 'neutral'}>
                    {network.isActive ? t('admin.networks.enabled') : t('admin.networks.disabled')}
                  </Badge>
                }
              />

              <div className={styles.rows}>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.networks.minDeposit')}</span>
                  <span className={styles.rowValue}>
                    {network.minDepositOn && network.minDeposit
                      ? `${network.minDeposit} USD`
                      : t('admin.networks.minDepositOff')}
                  </span>
                </div>
                <div className={styles.row}>
                  <span className={styles.rowLabel}>{t('admin.networks.issued')}</span>
                  <span className={styles.rowValue}>
                    <span className={styles.networkTitle}>
                      <Wallet size={14} />
                      {network.issuedAddresses}
                    </span>
                  </span>
                </div>
              </div>

              {maySettings ? (
                <div className={styles.kpiRows}>
                  <Switch
                    label={t('admin.networks.showToUsers')}
                    checked={network.isActive}
                    disabled={pending}
                    onChange={(e) => toggle(network.id, e.target.checked)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    iconStart={<Pencil size={16} />}
                    onClick={() => openEdit(network)}
                  >
                    {t('admin.networks.edit')}
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {/* --- Правка пары ------------------------------------------------ */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={editing ? `${editing.name} · ${editing.asset}` : t('admin.networks.editTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {t('admin.networks.cancel')}
            </Button>
            <Button disabled={pending} onClick={save}>
              {t('admin.networks.save')}
            </Button>
          </>
        }
      >
        {draft ? (
          <div className={styles.stack}>
            {error ? <Toast tone="danger" title={error} /> : null}
            <ImageField
              label={t('admin.networks.icon')}
              hint={t('admin.networks.iconHint')}
              preview={draft.icon}
              onPick={pickIcon}
            />
            {/* Минимум отдельным переключателем: «ноль» и «минимума
                нет» означают разное, и держать их одним полем значит
                рано или поздно отключить минимум опечаткой. */}
            <Switch
              label={t('admin.networks.minDepositSwitch')}
              checked={draft.minDepositOn}
              onChange={(e) => setDraft({ ...draft, minDepositOn: e.target.checked })}
            />
            <Input
              label={t('admin.networks.minDeposit')}
              numeric
              value={draft.minDeposit}
              disabled={!draft.minDepositOn}
              onChange={(e) => setDraft({ ...draft, minDeposit: e.target.value })}
              hint={t('admin.networks.minDepositHint')}
            />
          </div>
        ) : null}
      </Modal>
    </AdminShell>
  )
}

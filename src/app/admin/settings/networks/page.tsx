'use client'

import { useState } from 'react'
import { Pencil, RefreshCw, Wallet } from 'lucide-react'
import {
  AssetIcon,
  Badge,
  Button,
  Card,
  CardHeader,
  ImageField,
  Input,
  Modal,
  Switch,
  Toast,
} from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import { NETWORKS, SYSTEM } from '@/fixtures/admin'
import type { AdminNetwork } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from '../../AdminShell'
import styles from '../../admin.module.css'

/**
 * Сети и монеты.
 *
 * Адресов здесь больше нет, и это не упрощение интерфейса, а смена
 * механики. Раньше оператор заводил один адрес на всех, а пользователь
 * потом доказывал заявкой, что перевод его. Теперь адрес заводит себе
 * каждый пользователь, и адрес за ним закреплён: по поступлению сразу
 * видно, чей это платёж, и зачисление происходит без оператора. Таблица
 * выданных адресов — отдельным разделом «Крипто-адреса».
 *
 * Оператору здесь осталось то, что общее для всех: открыть или закрыть
 * пару «сеть + монета», загрузить значок монеты и задать минимальную
 * сумму. Закрытая пара исчезает из выбора у пользователей, но остаётся
 * в истории прошлых поступлений — поэтому она выключается, а не удаляется.
 */

interface Draft {
  id: string
  minDeposit: string
  minDepositOn: boolean
  iconUrl: string | null
}

export default function NetworksPage() {
  const { locale, t } = useI18n()
  const { can } = useAdmin()
  const maySettings = can('MANAGE_SETTINGS')

  // Копия фикстуры: в прототипе правки видны до перезагрузки страницы.
  // Ничего не вычисляется.
  const [networks, setNetworks] = useState<AdminNetwork[]>(NETWORKS)
  const [draft, setDraft] = useState<Draft | null>(null)

  const editing = draft ? networks.find((n) => n.id === draft.id) : undefined

  function openEdit(network: AdminNetwork) {
    setDraft({
      id: network.id,
      minDeposit: network.minDeposit,
      minDepositOn: network.minDepositOn,
      iconUrl: network.iconUrl,
    })
  }

  function pickIcon(file: File | null) {
    if (!draft) return
    // Ссылка живёт в этой вкладке: файл никуда не отправляется.
    setDraft({ ...draft, iconUrl: file ? URL.createObjectURL(file) : null })
  }

  function save() {
    if (!draft) return
    setNetworks(
      networks.map((n) =>
        n.id === draft.id
          ? {
              ...n,
              minDeposit: draft.minDeposit,
              minDepositOn: draft.minDepositOn,
              iconUrl: draft.iconUrl,
            }
          : n,
      ),
    )
    setDraft(null)
  }

  function toggle(id: string, isActive: boolean) {
    setNetworks(networks.map((n) => (n.id === id ? { ...n, isActive } : n)))
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

      <Toast
        tone="neutral"
        title={t('admin.networks.whereTitle')}
        text={t('admin.networks.whereText')}
      />

      {/* Список пар приходит от сервиса, который выдаёт адреса: открывать
          у себя сеть, которой он не умеет, бессмысленно — адрес в ней
          никто не выдаст. Значок монеты тоже берём оттуда, если сервис
          его отдаёт; загрузка вручную остаётся на случай, когда нет. */}
      <Card density="dense">
        <CardHeader
          title={t('admin.networks.sourceTitle')}
          subtitle={t('admin.networks.sourceText')}
          action={
            maySettings ? (
              <Button variant="secondary" size="sm" iconStart={<RefreshCw size={16} />}>
                {t('admin.networks.refresh')}
              </Button>
            ) : undefined
          }
        />
        <p className={styles.kpiHint}>
          {t('admin.networks.syncedAt', { at: formatDateTime(locale, SYSTEM.services[1]!.lastAt) })}
        </p>
      </Card>

      <div className={styles.grid3}>
        {networks.map((network) => (
          <Card density="dense" key={network.id}>
            <CardHeader
              /* Значок у названия пары, а не у каждого адреса: монета
                 общая на всю пару. */
              title={
                <span className={styles.networkTitle}>
                  <AssetIcon asset={network.asset} src={network.iconUrl} />
                  {network.name} · {network.asset}
                </span>
              }
              subtitle={
                network.requiresMemo ? t('admin.networks.requiresMemo') : t('admin.networks.noMemo')
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
                  {network.minDepositOn
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

      {/* --- Правка пары ---------------------------------------------------- */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={
          editing ? `${editing.name} · ${editing.asset}` : t('admin.networks.editTitle')
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {t('admin.networks.cancel')}
            </Button>
            <Button onClick={save}>{t('admin.networks.save')}</Button>
          </>
        }
      >
        {draft ? (
          <div className={styles.stack}>
            <ImageField
              label={t('admin.networks.icon')}
              hint={t('admin.networks.iconHint')}
              preview={draft.iconUrl}
              onPick={pickIcon}
            />
            {/* Минимум отдельным переключателем: «ноль» и «минимума нет»
                означают разное, и держать их одним полем значит рано или
                поздно отключить минимум опечаткой. */}
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

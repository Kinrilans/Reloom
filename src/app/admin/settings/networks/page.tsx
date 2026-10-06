'use client'

import { useState } from 'react'
import { Pencil, Plus, QrCode, Trash2 } from 'lucide-react'
import {
  AssetIcon,
  Badge,
  Button,
  Card,
  CardHeader,
  ImageField,
  Input,
  Modal,
  QrPlaceholder,
  Select,
  Switch,
  Toast,
} from '@/ui'
import type { SelectOption } from '@/ui'
import { useI18n } from '@/i18n'
import { ASSETS, NETWORKS } from '@/fixtures/admin'
import type { AdminNetwork, NetworkAddress } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from '../../AdminShell'
import styles from '../../admin.module.css'

/**
 * Сети и адреса.
 *
 * Адрес показывается оператору на подтверждение при сохранении: ошибка
 * в адресе означает потерянные деньги пользователя.
 *
 * QR строится из адреса автоматически и картинкой не загружается: иначе
 * на экране пользователя оказались бы адрес и код, ведущие в разные
 * места, и разошлись бы они молча.
 *
 * Отключённая сеть исчезает из выбора у пользователей, но остаётся
 * в истории прошлых заявок — поэтому адрес, на который уже приходили
 * заявки, выключается, а не удаляется.
 */

interface AddressDraft {
  networkId: string
  asset: string
  address: string
  reserve: string
  memo: string
  label: string
  iconUrl: string | null
}

/** Та же величина, что и у пустой рамки в CSS (--size-qr). */
const QR_SIZE = 120

const EMPTY_DRAFT: AddressDraft = {
  networkId: NETWORKS[0]!.id,
  asset: NETWORKS[0]!.asset,
  address: '',
  reserve: '',
  memo: '',
  label: '',
  iconUrl: null,
}

export default function NetworksPage() {
  const { t } = useI18n()
  const { can } = useAdmin()
  const maySettings = can('MANAGE_SETTINGS')
  const mayAddresses = can('MANAGE_ADDRESSES')

  // Копия фикстуры: в прототипе правки видны до перезагрузки страницы,
  // чтобы кнопки можно было показать в деле. Ничего не вычисляется.
  const [networks, setNetworks] = useState<AdminNetwork[]>(NETWORKS)

  const [draft, setDraft] = useState<AddressDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmTyped, setConfirmTyped] = useState('')
  const [removing, setRemoving] = useState<{ network: AdminNetwork; address: NetworkAddress } | null>(
    null,
  )
  const [showQr, setShowQr] = useState<NetworkAddress | null>(null)

  const networkOptions: SelectOption[] = networks.map((n) => ({ value: n.id, label: n.name }))
  const assetOptions: SelectOption[] = ASSETS.map((a) => ({ value: a, label: a }))

  const draftNetwork = draft ? networks.find((n) => n.id === draft.networkId) : undefined

  function openAdd() {
    setDraft(EMPTY_DRAFT)
    setEditingId(null)
    setConfirmTyped('')
  }

  function openEdit(network: AdminNetwork, address: NetworkAddress) {
    setDraft({
      networkId: network.id,
      asset: network.asset,
      address: address.address,
      reserve: '',
      memo: address.memo ?? '',
      label: address.label ?? '',
      iconUrl: network.iconUrl,
    })
    setEditingId(address.id)
    setConfirmTyped('')
  }

  function closeDraft() {
    setDraft(null)
    setEditingId(null)
    setConfirmTyped('')
  }

  function pickIcon(file: File | null) {
    if (!draft) return
    // Ссылка живёт в этой вкладке: файл никуда не отправляется.
    setDraft({ ...draft, iconUrl: file ? URL.createObjectURL(file) : null })
  }

  function saveDraft() {
    if (!draft) return
    const extra: NetworkAddress[] = [
      {
        id: editingId ?? `new-${draft.address.slice(0, 6)}`,
        address: draft.address,
        memo: draft.memo.length > 0 ? draft.memo : null,
        label: draft.label.length > 0 ? draft.label : null,
        isActive: true,
        usedInDeposits: 0,
      },
    ]
    if (draft.reserve.length > 0) {
      extra.push({
        id: `${extra[0]!.id}-reserve`,
        address: draft.reserve,
        memo: null,
        label: t('admin.networks.reserveLabel'),
        isActive: false,
        usedInDeposits: 0,
      })
    }

    setNetworks(
      networks.map((n) => {
        if (n.id !== draft.networkId) return n
        const kept = editingId ? n.addresses.filter((a) => a.id !== editingId) : n.addresses
        return { ...n, iconUrl: draft.iconUrl, addresses: [...kept, ...extra] }
      }),
    )
    closeDraft()
  }

  function removeAddress() {
    if (!removing) return
    setNetworks(
      networks.map((n) =>
        n.id === removing.network.id
          ? { ...n, addresses: n.addresses.filter((a) => a.id !== removing.address.id) }
          : n,
      ),
    )
    setRemoving(null)
  }

  function disableAddress() {
    if (!removing) return
    setNetworks(
      networks.map((n) =>
        n.id === removing.network.id
          ? {
              ...n,
              addresses: n.addresses.map((a) =>
                a.id === removing.address.id ? { ...a, isActive: false } : a,
              ),
            }
          : n,
      ),
    )
    setRemoving(null)
  }

  return (
    <AdminShell
      title={t('admin.networks.title')}
      note={t('admin.networks.note')}
      action={
        mayAddresses ? (
          <Button iconStart={<Plus size={18} />} onClick={openAdd}>
            {t('admin.networks.add')}
          </Button>
        ) : null
      }
    >
      {!mayAddresses ? (
        <Toast
          tone="neutral"
          title={t('admin.networks.readOnlyTitle')}
          text={t('admin.networks.readOnlyText')}
        />
      ) : null}

      <div className={styles.grid2}>
        {networks.map((network) => (
          <Card density="dense" key={network.id}>
            <CardHeader
              /* Значок у названия сети, а не у каждого адреса: монета
                 общая на всю сеть, и повторять её у адресов значило бы
                 намекать, что они могут быть разными. */
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

            {network.addresses.length === 0 ? (
              <p className={styles.muted}>{t('admin.networks.noAddresses')}</p>
            ) : (
              <div className={styles.addressList}>
                {network.addresses.map((address) => (
                  <div className={styles.addressRow} key={address.id}>
                    <div className={styles.addressBody}>
                      <div className={styles.addressHead}>
                        <span className={styles.statusTitle}>{address.label ?? t('admin.networks.noLabel')}</span>
                        <Badge tone={address.isActive ? 'success' : 'neutral'}>
                          {address.isActive
                            ? t('admin.networks.addressActive')
                            : t('admin.networks.addressOff')}
                        </Badge>
                      </div>
                      <p className={styles.mono}>{address.address}</p>
                      {address.memo ? <p className={styles.mono}>memo: {address.memo}</p> : null}
                      {address.usedInDeposits > 0 ? (
                        <p className={styles.company}>
                          {t('admin.networks.usedIn', { count: address.usedInDeposits })}
                        </p>
                      ) : null}
                    </div>

                    <div className={styles.addressActions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={t('admin.networks.showQr')}
                        title={t('admin.networks.showQr')}
                        iconStart={<QrCode size={16} />}
                        onClick={() => setShowQr(address)}
                      />
                      {mayAddresses ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label={t('admin.networks.editAddress')}
                            title={t('admin.networks.editAddress')}
                            iconStart={<Pencil size={16} />}
                            onClick={() => openEdit(network, address)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label={t('admin.networks.deleteAddress')}
                            title={t('admin.networks.deleteAddress')}
                            iconStart={<Trash2 size={16} />}
                            onClick={() => setRemoving({ network, address })}
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {maySettings ? (
              <div className={styles.kpiRows}>
                <Switch label={t('admin.networks.showToUsers')} defaultChecked={network.isActive} />
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      {/* --- Заведение и правка адреса ------------------------------------- */}
      <Modal
        open={draft !== null}
        onClose={closeDraft}
        title={editingId ? t('admin.networks.editTitle') : t('admin.networks.newTitle')}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeDraft}>
              {t('admin.networks.cancel')}
            </Button>
            <Button
              /* Необратимое по последствиям действие: ошибка в адресе
                 означает потерянные деньги пользователя. */
              disabled={draft === null || draft.address.length === 0 || confirmTyped !== draft.address}
              onClick={saveDraft}
            >
              {t('admin.networks.save')}
            </Button>
          </>
        }
      >
        {draft ? (
          <div className={styles.grid2}>
            <div className={styles.stack}>
              <Select
                label={t('admin.networks.network')}
                options={networkOptions}
                value={draft.networkId}
                onChange={(value) => {
                  const next = networks.find((n) => n.id === value)
                  setDraft({
                    ...draft,
                    networkId: value,
                    asset: next?.asset ?? draft.asset,
                    iconUrl: next?.iconUrl ?? null,
                  })
                }}
              />
              <Select
                label={t('admin.networks.asset')}
                options={assetOptions}
                value={draft.asset}
                onChange={(value) => setDraft({ ...draft, asset: value })}
              />
              <ImageField
                label={t('admin.networks.icon')}
                hint={t('admin.networks.iconHint')}
                preview={draft.iconUrl}
                onPick={pickIcon}
              />
              <Input
                label={t('admin.networks.label')}
                placeholder={t('admin.networks.labelPlaceholder')}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </div>

            <div className={styles.stack}>
              <Input
                label={t('admin.networks.address')}
                placeholder={t('admin.networks.addressPlaceholder')}
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                required
              />
              {draftNetwork?.requiresMemo ? (
                <Input
                  label="memo / tag"
                  hint={t('admin.networks.memoHint')}
                  value={draft.memo}
                  onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
                />
              ) : null}
              <Input
                label={t('admin.networks.reserve')}
                hint={t('admin.networks.reserveHint')}
                placeholder={t('admin.networks.reservePlaceholder')}
                value={draft.reserve}
                onChange={(e) => setDraft({ ...draft, reserve: e.target.value })}
              />

              <div className={styles.qrPreview}>
                {draft.address.length > 0 ? (
                  <QrPlaceholder value={draft.address} size={QR_SIZE} />
                ) : (
                  /* Пустой код не рисуем: картинка, не ведущая никуда,
                     выглядит как готовый адрес. */
                  <span className={styles.qrEmpty}>{t('admin.networks.qrEmpty')}</span>
                )}
                <p className={styles.kpiHint}>{t('admin.networks.qrHint')}</p>
              </div>
            </div>

            <div className={styles.modalWide}>
              <Toast
                tone="danger"
                title={t('admin.networks.dangerTitle')}
                text={t('admin.networks.dangerText')}
              />
              <Input
                label={t('admin.networks.repeat')}
                value={confirmTyped}
                onChange={(e) => setConfirmTyped(e.target.value)}
                placeholder={t('admin.networks.repeatPlaceholder')}
                error={
                  confirmTyped.length > 0 && confirmTyped !== draft.address
                    ? t('admin.networks.mismatch')
                    : undefined
                }
              />
            </div>
          </div>
        ) : null}
      </Modal>

      {/* --- Удаление ------------------------------------------------------- */}
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t('admin.networks.deleteTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              {t('admin.networks.cancel')}
            </Button>
            {removing && removing.address.usedInDeposits > 0 ? (
              <Button onClick={disableAddress}>{t('admin.networks.disableAddress')}</Button>
            ) : (
              <Button variant="danger" onClick={removeAddress}>
                {t('admin.networks.delete')}
              </Button>
            )}
          </>
        }
      >
        {removing ? (
          <div className={styles.stack}>
            {removing.address.usedInDeposits > 0 ? (
              <Toast
                tone="warning"
                title={t('admin.networks.cantDeleteTitle')}
                text={t('admin.networks.cantDeleteText', {
                  count: removing.address.usedInDeposits,
                })}
              />
            ) : (
              <Toast
                tone="neutral"
                title={t('admin.networks.canDeleteTitle')}
                text={t('admin.networks.canDeleteText')}
              />
            )}
            <p className={styles.mono}>{removing.address.address}</p>
          </div>
        ) : null}
      </Modal>

      {/* --- QR отдельного адреса -------------------------------------------- */}
      <Modal
        open={showQr !== null}
        onClose={() => setShowQr(null)}
        title={t('admin.networks.qrTitle')}
        footer={<Button onClick={() => setShowQr(null)}>{t('admin.profile.close')}</Button>}
      >
        {showQr ? (
          <div className={styles.qrPreview}>
            <QrPlaceholder value={showQr.address} size={168} />
            <p className={styles.mono}>{showQr.address}</p>
            <p className={styles.kpiHint}>{t('admin.networks.qrModalHint')}</p>
          </div>
        ) : null}
      </Modal>
    </AdminShell>
  )
}

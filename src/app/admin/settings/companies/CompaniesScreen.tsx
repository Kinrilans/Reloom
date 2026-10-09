'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import {
  Amount,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Input,
  Modal,
  Switch,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Toast,
} from '@/ui'
import type { BadgeTone } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type { CompanyView } from '@/server/admin/settings'
import { AdminShell } from '../../AdminShell'
import { useAdmin } from '../../_store/AdminStore'
import { addCompanyAction, saveCompanyAction } from './actions'
import styles from '../../admin.module.css'

const TONE: Record<string, BadgeTone> = {
  ok: 'success',
  warn20: 'warning',
  warn15: 'warning',
  urgent10: 'danger',
  critical: 'danger',
}

/**
 * Компании холдинга.
 *
 * Депозитный адрес пула показан только для чтения и подтягивается
 * при чтении пула у эмитента. Поля для ввода нет нигде: адрес,
 * введённый руками, означает пул, ушедший на чужой кошелёк.
 */
export function CompaniesScreen({ companies }: { companies: CompanyView[] }) {
  const { locale, t } = useI18n()
  const { can } = useAdmin()
  const router = useRouter()
  const mayEdit = can('MANAGE_SETTINGS')

  const [adding, setAdding] = useState(false)
  const [kybConfirmed, setKybConfirmed] = useState(false)
  const [draft, setDraft] = useState({ name: '', oxenClientId: '', isActive: true })
  const [editing, setEditing] = useState<CompanyView | null>(null)
  const [editDraft, setEditDraft] = useState({ name: '', oxenClientId: '', isActive: true })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function closeAdd() {
    setAdding(false)
    setKybConfirmed(false)
    setDraft({ name: '', oxenClientId: '', isActive: true })
    setError(null)
  }

  function openEdit(company: CompanyView) {
    setEditing(company)
    setEditDraft({
      name: company.name,
      oxenClientId: company.oxenClientId,
      isActive: company.isActive,
    })
    setError(null)
  }

  function add() {
    setError(null)
    startTransition(async () => {
      const result = await addCompanyAction(draft)
      if (!result.ok) {
        setError(result.error)
        return
      }
      closeAdd()
      router.refresh()
    })
  }

  function saveEdit() {
    if (!editing) return
    setError(null)
    startTransition(async () => {
      const result = await saveCompanyAction({ companyId: editing.id, ...editDraft })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setEditing(null)
      router.refresh()
    })
  }

  return (
    <AdminShell
      title={t('admin.companies.title')}
      note={t('admin.companies.note')}
      action={
        mayEdit ? (
          <Button iconStart={<Plus size={18} />} onClick={() => setAdding(true)}>
            {t('admin.companies.add')}
          </Button>
        ) : null
      }
    >
      {error && !adding && !editing ? <Toast tone="danger" title={error} /> : null}

      <Toast
        tone="neutral"
        title={t('admin.companies.readOnlyTitle')}
        text={t('admin.companies.readOnlyText')}
      />

      <Card density="flush">
        <Table>
          <THead>
            <TR>
              <TH>{t('admin.col.company')}</TH>
              <TH>{t('admin.companies.col.oxenId')}</TH>
              <TH>{t('admin.companies.col.deposit')}</TH>
              <TH align="numeric">{t('admin.companies.col.pool')}</TH>
              <TH align="numeric">{t('admin.companies.col.coverage')}</TH>
              <TH>{t('admin.companies.col.read')}</TH>
              <TH>{t('admin.col.status')}</TH>
              {mayEdit ? <TH align="actions">{t('admin.col.action')}</TH> : null}
            </TR>
          </THead>
          <TBody>
            {companies.map((company) => (
              <TR key={company.id} flagged={company.state === 'critical'}>
                <TD primary>{company.name}</TD>
                <TD muted>
                  <span className={styles.mono}>{company.oxenClientId}</span>
                </TD>
                <TD muted>
                  <span className={styles.mono}>
                    {company.depositAddress ?? t('admin.companies.depositUnknown')}
                  </span>
                </TD>
                <TD align="numeric">
                  <Amount value={company.pool} currency="USD" size="caption" />
                </TD>
                <TD align="numeric">
                  <Badge tone={TONE[company.state] ?? 'neutral'}>{company.coverage} %</Badge>
                </TD>
                <TD muted>
                  {company.poolReadAt
                    ? formatDateTime(locale, company.poolReadAt)
                    : t('admin.companies.neverRead')}
                </TD>
                <TD>
                  <Badge tone={company.isActive ? 'success' : 'neutral'}>
                    {company.isActive
                      ? t('admin.companies.active')
                      : t('admin.companies.disabled')}
                  </Badge>
                </TD>
                {mayEdit ? (
                  <TD align="actions">
                    <div className={styles.actionsCell}>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconStart={<Pencil size={16} />}
                        onClick={() => openEdit(company)}
                      >
                        {t('admin.companies.edit')}
                      </Button>
                    </div>
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card density="dense">
        <CardHeader title={t('admin.companies.whyTitle')} />
        <p className={styles.muted}>{t('admin.companies.whyText')}</p>
      </Card>

      {/* --- Добавление ------------------------------------------------- */}
      <Modal
        open={adding}
        onClose={closeAdd}
        title={t('admin.companies.addTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={closeAdd}>
              {t('admin.companies.cancel')}
            </Button>
            {/* Ошибка в cl_… уводит карты в чужой пул, поэтому
                добавление подтверждается явно, а не кнопкой «ОК». */}
            <Button disabled={!kybConfirmed || pending} onClick={add}>
              {t('admin.companies.submit')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          {error ? <Toast tone="danger" title={error} /> : null}
          <Toast
            tone="neutral"
            title={t('admin.companies.kybTitle')}
            text={t('admin.companies.kybText')}
          />
          <Input
            label={t('admin.companies.name')}
            placeholder="Holding Epsilon"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
          />
          <Input
            label={t('admin.companies.oxenId')}
            placeholder="cl_…"
            value={draft.oxenClientId}
            onChange={(e) => setDraft({ ...draft, oxenClientId: e.target.value })}
            required
          />
          {/* Поля для депозитного адреса здесь нет. Адрес выдаёт
              эмитент после заведения компании, и он подтянется сам —
              пустое поле на этом шаге заполнить нечем, а заполненное
              руками означает чужой адрес, на который уйдут деньги
              пула. */}
          <Toast
            tone="neutral"
            title={t('admin.companies.depositLaterTitle')}
            text={t('admin.companies.depositLaterText')}
          />
          <Switch
            label={t('admin.companies.activeSwitch')}
            checked={draft.isActive}
            onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
          />
          <Checkbox
            label={t('admin.companies.kybConfirm')}
            checked={kybConfirmed}
            onChange={(e) => setKybConfirmed(e.target.checked)}
          />
        </div>
      </Modal>

      {/* --- Правка компании -------------------------------------------- */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing
            ? t('admin.companies.editTitle', { name: editing.name })
            : t('admin.companies.editFallback')
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('admin.companies.cancel')}
            </Button>
            <Button disabled={pending} onClick={saveEdit}>
              {t('admin.companies.save')}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className={styles.stack}>
            {error ? <Toast tone="danger" title={error} /> : null}
            <Input
              label={t('admin.companies.name')}
              value={editDraft.name}
              onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
              required
            />
            <Input
              label={t('admin.companies.oxenId')}
              value={editDraft.oxenClientId}
              onChange={(e) => setEditDraft({ ...editDraft, oxenClientId: e.target.value })}
              hint={t('admin.companies.oxenIdHint')}
              required
            />
            <Input
              label={t('admin.companies.depositAddress')}
              value={editing.depositAddress ?? ''}
              placeholder={t('admin.companies.depositUnknown')}
              hint={t('admin.companies.depositHintShort')}
              readOnly
            />
            <Switch
              label={t('admin.companies.activeSwitch')}
              checked={editDraft.isActive}
              onChange={(e) => setEditDraft({ ...editDraft, isActive: e.target.checked })}
            />
            <Toast
              tone="neutral"
              title={t('admin.companies.stateTitle')}
              text={t('admin.companies.stateText')}
            />
          </div>
        ) : null}
      </Modal>
    </AdminShell>
  )
}

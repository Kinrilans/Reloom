'use client'

import { useState } from 'react'
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
import { useI18n } from '@/i18n'
import { COMPANIES } from '@/fixtures/admin'
import type { Company, CoverageState } from '@/fixtures/admin'
import type { BadgeTone } from '@/ui'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from '../../AdminShell'
import styles from '../../admin.module.css'

const TONE: Record<CoverageState, BadgeTone> = {
  ok: 'success',
  warn20: 'warning',
  warn15: 'warning',
  urgent10: 'danger',
  critical: 'danger',
}

/**
 * Компании холдинга.
 *
 * Добавление компании возможно только после того, как KYB пройден с
 * эмитентом лично и получен cl_…: создания клиентов через их API мы
 * не используем.
 *
 * Название и cl_… правятся: эмитент меняет ключи, а компанию переименовывают.
 * Пул, покрытие и депозитный адрес — только чтение: они приходят от эмитента
 * и руками не задаются.
 */
export default function CompaniesPage() {
  const { t } = useI18n()
  const { can } = useAdmin()
  const mayEdit = can('MANAGE_SETTINGS')

  const [companies, setCompanies] = useState<Company[]>(COMPANIES)
  const [adding, setAdding] = useState(false)
  const [kybConfirmed, setKybConfirmed] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)

  function closeAdd() {
    setAdding(false)
    setKybConfirmed(false)
  }

  function saveEdit() {
    if (!editing) return
    setCompanies(companies.map((c) => (c.id === editing.id ? editing : c)))
    setEditing(null)
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
              <TH>{t('admin.col.status')}</TH>
              {mayEdit ? <TH align="actions">{t('admin.col.action')}</TH> : null}
            </TR>
          </THead>
          <TBody>
            {companies.map((company) => (
              <TR key={company.id} flagged={company.coverageState === 'critical'}>
                <TD primary>{company.name}</TD>
                <TD muted>
                  <span className={styles.mono}>{company.oxenClientId}</span>
                </TD>
                <TD muted>
                  <span className={styles.mono}>{company.depositAddress}</span>
                </TD>
                <TD align="numeric">
                  <Amount value={company.pool} currency="USD" size="caption" />
                </TD>
                <TD align="numeric">
                  <Badge tone={TONE[company.coverageState]}>{company.coverage} %</Badge>
                </TD>
                <TD>
                  <Badge tone={company.isActive ? 'success' : 'neutral'}>
                    {company.isActive ? t('admin.companies.active') : t('admin.companies.disabled')}
                  </Badge>
                </TD>
                {mayEdit ? (
                  <TD align="actions">
                    <div className={styles.actionsCell}>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconStart={<Pencil size={16} />}
                        onClick={() => setEditing(company)}
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

      <Modal
        open={adding}
        onClose={closeAdd}
        title={t('admin.companies.addTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={closeAdd}>
              {t('admin.companies.cancel')}
            </Button>
            {/* Ошибка в cl_… уводит карты в чужой пул, поэтому добавление
                подтверждается явно, а не кнопкой «ОК». */}
            <Button disabled={!kybConfirmed} onClick={closeAdd}>
              {t('admin.companies.submit')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <Toast
            tone="neutral"
            title={t('admin.companies.kybTitle')}
            text={t('admin.companies.kybText')}
          />
          <Input label={t('admin.companies.name')} placeholder="Holding Epsilon" required />
          <Input label={t('admin.companies.oxenId')} placeholder="cl_…" required />
          {/* Поля для депозитного адреса здесь нет. Адрес выдаёт эмитент
              после заведения компании, и он подтянется сам — пустое поле
              на этом шаге заполнить нечем, а заполненное руками означает
              чужой адрес, на который уйдут деньги пула. */}
          <Toast
            tone="neutral"
            title={t('admin.companies.depositLaterTitle')}
            text={t('admin.companies.depositLaterText')}
          />
          <Switch label={t('admin.companies.activeSwitch')} defaultChecked />
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
            <Button onClick={saveEdit}>{t('admin.companies.save')}</Button>
          </>
        }
      >
        {editing ? (
          <div className={styles.stack}>
            <Input
              label={t('admin.companies.name')}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              required
            />
            <Input
              label={t('admin.companies.oxenId')}
              value={editing.oxenClientId}
              onChange={(e) => setEditing({ ...editing, oxenClientId: e.target.value })}
              hint={t('admin.companies.oxenIdHint')}
              required
            />
            <Input
              label={t('admin.companies.depositAddress')}
              value={editing.depositAddress}
              hint={t('admin.companies.depositHintShort')}
              readOnly
            />
            <Switch
              label={t('admin.companies.activeSwitch')}
              checked={editing.isActive}
              onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
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

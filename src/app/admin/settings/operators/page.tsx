'use client'

import { useState } from 'react'
import { Pencil, Plus, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Modal,
  CheckboxList,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Toast,
} from '@/ui'
import type { SelectOption } from '@/ui'
import { useI18n } from '@/i18n'
import { AUDIT, OPERATORS, RIGHTS } from '@/fixtures/admin'
import type { Operator, Right } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from '../../AdminShell'
import styles from '../../admin.module.css'

/**
 * Операторы и права.
 *
 * Права разграничены. Главный администратор единственный изначально имеет
 * GRANT_RIGHTS и может выдать его другому. Оператор с MANAGE_USERS выдавать
 * права НЕ может: заведение пользователей и раздача прав — разные вещи.
 *
 * Удаление ограничено тем же правилом, что и везде в системе: запись,
 * на которую ссылается журнал аудита, только отключается. Иначе прошлые
 * записи перестают объясняться, а журнал — это финансовая отчётность.
 *
 * Проверка прав в продукте будет на сервере, в сервисном слое, а не только
 * в интерфейсе.
 */

interface OperatorForm {
  name: string
  email: string
  secret: string
  rights: Right[]
}

const EMPTY_FORM: OperatorForm = { name: '', email: '', secret: '', rights: [] }

/** Сколько записей журнала оставил оператор. Выборка по списку, не расчёт. */
function auditCount(name: string): number {
  return AUDIT.filter((entry) => entry.operator === name).length
}

export default function OperatorsPage() {
  const { t } = useI18n()
  const { can, operator, setOperator } = useAdmin()
  const mayGrant = can('GRANT_RIGHTS')

  const [operators, setOperators] = useState<Operator[]>(OPERATORS)
  const [editing, setEditing] = useState<Operator | null>(null)
  const [form, setForm] = useState<OperatorForm>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [removing, setRemoving] = useState<Operator | null>(null)
  const [resetting2fa, setResetting2fa] = useState<Operator | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function openCreate() {
    setForm(EMPTY_FORM)
    setCreating(true)
  }

  function openEdit(op: Operator) {
    // Пароль не подставляется: мы его не храним и показать не можем.
    setForm({ name: op.name, email: op.email, secret: '', rights: [...op.rights] })
    setEditing(op)
  }

  function saveCreate() {
    setOperators([
      ...operators,
      {
        id: `op-new-${operators.length + 1}`,
        name: form.name,
        email: form.email,
        rights: form.rights,
        isSuperAdmin: false,
        isActive: true,
        // Настраивает сам при первом входе — выдать второй фактор за него
        // невозможно.
        twoFactorEnabled: false,
      },
    ])
    setCreating(false)
    setNotice(t('admin.operators.createdNotice', { name: form.name }))
  }

  function saveEdit() {
    if (!editing) return
    setOperators(
      operators.map((o) =>
        o.id === editing.id
          ? { ...o, name: form.name, email: form.email, rights: form.rights }
          : o,
      ),
    )
    setEditing(null)
    setNotice(t('admin.operators.savedNotice', { name: form.name }))
  }

  function reset2fa() {
    if (!resetting2fa) return
    setOperators(
      operators.map((o) => (o.id === resetting2fa.id ? { ...o, twoFactorEnabled: false } : o)),
    )
    // Окно правки держит свой снимок оператора — обновляем и его, иначе
    // после сброса метка в нём осталась бы прежней.
    if (editing?.id === resetting2fa.id) {
      setEditing({ ...editing, twoFactorEnabled: false })
    }
    setNotice(t('admin.operators.reset2faNotice', { name: resetting2fa.name }))
    setResetting2fa(null)
  }

  function removeOperator() {
    if (!removing) return
    setOperators(operators.filter((o) => o.id !== removing.id))
    setNotice(t('admin.operators.deletedNotice', { name: removing.name }))
    setRemoving(null)
  }

  function disableOperator() {
    if (!removing) return
    setOperators(operators.map((o) => (o.id === removing.id ? { ...o, isActive: false } : o)))
    setNotice(t('admin.operators.disabledNotice', { name: removing.name }))
    setRemoving(null)
  }

  const formValid = form.name.trim().length > 0 && form.email.trim().length > 0

  // Код права показываем вместе с расшифровкой: в журнале аудита и в
  // документации фигурирует именно код.
  const rightOptions: SelectOption[] = RIGHTS.map((right) => ({
    value: right,
    label: `${right} — ${t(`admin.right.${right}`)}`,
  }))

  return (
    <AdminShell
      title={t('admin.operators.title')}
      note={t('admin.operators.note')}
      action={
        mayGrant ? (
          <Button iconStart={<Plus size={18} />} onClick={openCreate}>
            {t('admin.operators.add')}
          </Button>
        ) : null
      }
    >
      {notice ? <Toast tone="success" title={notice} onClose={() => setNotice(null)} /> : null}

      {!mayGrant ? (
        <Toast
          tone="neutral"
          title={t('admin.operators.noGrantTitle')}
          text={t('admin.operators.noGrantText')}
        />
      ) : null}

      <Card density="flush">
        <Table>
          <THead>
            <TR>
              <TH>{t('admin.operators.col.operator')}</TH>
              <TH>Email</TH>
              <TH>{t('admin.operators.col.rights')}</TH>
              <TH>{t('admin.col.status')}</TH>
              <TH align="actions">{t('admin.col.action')}</TH>
            </TR>
          </THead>
          <TBody>
            {operators.map((op) => (
              <TR key={op.id}>
                <TD primary>
                  <span className={styles.cellFlow}>
                    {op.name}
                    {op.isSuperAdmin ? (
                      <Badge tone="brand" icon={<ShieldCheck size={12} />} dot={false}>
                        {t('admin.operators.chief')}
                      </Badge>
                    ) : null}
                  </span>
                </TD>
                <TD muted>{op.email}</TD>
                <TD muted>
                  {t('admin.operators.rightsCount', { granted: op.rights.length, total: RIGHTS.length })}
                </TD>
                <TD>
                  <Badge tone={op.isActive ? 'success' : 'neutral'}>
                    {op.isActive ? t('admin.operators.active') : t('admin.operators.disabled')}
                  </Badge>
                </TD>
                <TD align="actions">
                  <div className={styles.actionsCell}>
                    {mayGrant ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconStart={<Pencil size={16} />}
                        onClick={() => openEdit(op)}
                      >
                        {t('admin.operators.edit')}
                      </Button>
                    ) : null}
                    {/* В прототипе — способ посмотреть админку глазами
                        оператора с другим набором прав. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={op.id === operator.id}
                      onClick={() => setOperator(op.id)}
                    >
                      {t('admin.operators.signInAs')}
                    </Button>
                    {/* Удаление последним: у главного администратора его нет,
                        и отсутствующая кнопка в середине ряда сдвигала бы
                        соседние подписи относительно других строк.
                        Систему нельзя оставить без обладателя GRANT_RIGHTS. */}
                    {mayGrant && !op.isSuperAdmin ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={t('admin.operators.deleteAria', { name: op.name })}
                        title={t('admin.operators.delete')}
                        iconStart={<Trash2 size={16} />}
                        onClick={() => setRemoving(op)}
                      />
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {/* --- Заведение ---------------------------------------------------- */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('admin.operators.newTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('admin.operators.cancel')}
            </Button>
            <Button disabled={!formValid || form.secret.length === 0} onClick={saveCreate}>
              {t('admin.operators.create')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <Input
            label={t('admin.operators.name')}
            placeholder={t('admin.operators.namePlaceholder')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label={t('admin.operators.login')}
            type="email"
            autoComplete="off"
            placeholder="operator@reloom.example"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label={t('admin.operators.password')}
            type="password"
            autoComplete="new-password"
            value={form.secret}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
            hint={t('admin.operators.passwordHint')}
            required
          />
          <CheckboxList
            label={t('admin.operators.rights')}
            options={rightOptions}
            values={form.rights}
            onChange={(values) => setForm({ ...form, rights: values as Right[] })}
            hint={t('admin.operators.rightsHint')}
          />
          <Toast
            tone="neutral"
            title={t('admin.operators.oneByOneTitle')}
            text={t('admin.operators.oneByOneText')}
          />
        </div>
      </Modal>

      {/* --- Правка -------------------------------------------------------- */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing
            ? t('admin.operators.editTitle', { name: editing.name })
            : t('admin.operators.editFallback')
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('admin.operators.cancel')}
            </Button>
            <Button disabled={!formValid} onClick={saveEdit}>
              {t('admin.operators.save')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <Input
            label={t('admin.operators.name')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label={t('admin.operators.login')}
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label={t('admin.operators.newPassword')}
            type="password"
            autoComplete="new-password"
            value={form.secret}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
            hint={t('admin.operators.newPasswordHint')}
          />
          <CheckboxList
            label={t('admin.operators.rights')}
            options={rightOptions}
            values={form.rights}
            onChange={(values) => setForm({ ...form, rights: values as Right[] })}
            disabled={editing?.isSuperAdmin}
          />
          {editing?.isSuperAdmin ? (
            <p className={styles.kpiHint}>{t('admin.operators.superHint')}</p>
          ) : null}

          {/* Сброс второго фактора — отдельное действие, а не поле формы:
              оно применяется сразу и «Сохранить» его не отменит. */}
          <div className={styles.statusBlock}>
            {editing?.twoFactorEnabled ? (
              <Badge tone="success" icon={<ShieldCheck size={12} />} dot={false}>
                {t('admin.operators.twoFactorOn')}
              </Badge>
            ) : (
              <Badge tone="warning" icon={<ShieldOff size={12} />} dot={false}>
                {t('admin.operators.twoFactorOff')}
              </Badge>
            )}
            <p className={styles.muted}>{t('admin.operators.resetHint')}</p>
            <Button
              variant="secondary"
              size="sm"
              disabled={!editing?.twoFactorEnabled}
              onClick={() => setResetting2fa(editing)}
            >
              {t('admin.operators.reset2fa')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* --- Сброс второго фактора ----------------------------------------- */}
      <Modal
        open={resetting2fa !== null}
        onClose={() => setResetting2fa(null)}
        title={t('admin.operators.reset2faTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetting2fa(null)}>
              {t('admin.operators.cancel')}
            </Button>
            <Button variant="danger" onClick={reset2fa}>
              {t('admin.operators.reset')}
            </Button>
          </>
        }
      >
        {resetting2fa ? (
          <div className={styles.stack}>
            <Toast
              tone="warning"
              title={t('admin.operators.resetWarnTitle')}
              text={t('admin.operators.resetWarnText')}
            />
            <p className={styles.muted}>
              {resetting2fa.name} · {resetting2fa.email}
            </p>
          </div>
        ) : null}
      </Modal>

      {/* --- Удаление ------------------------------------------------------ */}
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t('admin.operators.deleteTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              {t('admin.operators.cancel')}
            </Button>
            {removing && auditCount(removing.name) > 0 ? (
              <Button onClick={disableOperator}>{t('admin.operators.disable')}</Button>
            ) : (
              <Button variant="danger" onClick={removeOperator}>
                {t('admin.operators.delete')}
              </Button>
            )}
          </>
        }
      >
        {removing ? (
          <div className={styles.stack}>
            {auditCount(removing.name) > 0 ? (
              <Toast
                tone="warning"
                title={t('admin.operators.cantDeleteTitle')}
                text={t('admin.operators.cantDeleteText', { count: auditCount(removing.name) })}
              />
            ) : (
              <Toast
                tone="neutral"
                title={t('admin.operators.canDeleteTitle')}
                text={t('admin.operators.canDeleteText')}
              />
            )}
            <p className={styles.muted}>
              {removing.name} · {removing.email}
            </p>
          </div>
        ) : null}
      </Modal>
    </AdminShell>
  )
}

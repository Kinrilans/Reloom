'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Pencil, Plus, ShieldCheck, ShieldOff } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CheckboxList,
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
import type { SelectOption } from '@/ui'
import { formatDateTime, useI18n } from '@/i18n'
import type { OperatorView } from '@/server/admin/settings'
import { AdminShell } from '../../AdminShell'
import { useAdmin } from '../../_store/AdminStore'
import {
  createOperatorAction,
  resetPasswordAction,
  resetTotpAction,
  setActiveAction,
  setRightsAction,
} from './actions'
import styles from '../../admin.module.css'

/**
 * Операторы и права.
 *
 * Удаления здесь нет: записи аудита ссылаются на оператора, и
 * удалённый оператор превратил бы историю в ссылки в никуда. Есть
 * отключение, и оно обратимо — вместе с ним отзываются его сессии,
 * иначе «отключён» означало бы только «не сможет войти заново».
 *
 * Пароль придумывает сервер и показывает один раз. Пароль,
 * придуманный одним человеком для другого, известен двоим и обычно
 * оказывается в переписке.
 *
 * Второй фактор оператор настраивает сам при первом входе: выдать его
 * за него нельзя, а пустить внутрь без фактора — значит оставить
 * админку за одним паролем.
 */

interface Form {
  fullName: string
  email: string
  rights: string[]
}

const EMPTY: Form = { fullName: '', email: '', rights: [] }

export function OperatorsScreen({
  operators,
  rights,
}: {
  operators: OperatorView[]
  rights: string[]
}) {
  const { locale, t } = useI18n()
  const { can, operator: me } = useAdmin()
  const router = useRouter()
  const mayGrant = can('GRANT_RIGHTS')

  const [form, setForm] = useState<Form>(EMPTY)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<OperatorView | null>(null)
  const [editRights, setEditRights] = useState<string[]>([])
  const [resetting2fa, setResetting2fa] = useState<OperatorView | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState<{ name: string; value: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  const rightOptions: SelectOption[] = rights.map((right) => ({
    value: right,
    // Код права показываем вместе с расшифровкой: в журнале аудита
    // и в документации фигурирует именно код.
    label: `${right} — ${t(`admin.right.${right}`)}`,
  }))

  function openEdit(operator: OperatorView) {
    setEditing(operator)
    setEditRights([...operator.rights])
    setError(null)
  }

  function create() {
    setError(null)
    startTransition(async () => {
      const result = await createOperatorAction(form)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCreating(false)
      setForm(EMPTY)
      setPassword({ name: form.fullName, value: result.oneTimePassword })
      setCopied(false)
      router.refresh()
    })
  }

  function saveRights() {
    if (!editing) return
    setError(null)
    startTransition(async () => {
      const result = await setRightsAction(editing.id, editRights)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setEditing(null)
      setNotice(t('admin.operators.savedNotice', { name: editing.name }))
      router.refresh()
    })
  }

  function toggleActive(operator: OperatorView, isActive: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await setActiveAction(operator.id, isActive)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setNotice(
        isActive
          ? t('admin.operators.enabledNotice', { name: operator.name })
          : t('admin.operators.disabledNotice', { name: operator.name }),
      )
      router.refresh()
    })
  }

  function reset2fa() {
    if (!resetting2fa) return
    setError(null)
    startTransition(async () => {
      const result = await resetTotpAction(resetting2fa.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setNotice(t('admin.operators.reset2faNotice', { name: resetting2fa.name }))
      setResetting2fa(null)
      setEditing(null)
      router.refresh()
    })
  }

  function resetPassword(operator: OperatorView) {
    setError(null)
    startTransition(async () => {
      const result = await resetPasswordAction(operator.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPassword({ name: operator.name, value: result.oneTimePassword })
      setCopied(false)
      setEditing(null)
      router.refresh()
    })
  }

  const formValid = form.fullName.trim().length > 0 && form.email.includes('@')

  return (
    <AdminShell
      title={t('admin.operators.title')}
      note={t('admin.operators.note')}
      action={
        mayGrant ? (
          <Button
            iconStart={<Plus size={18} />}
            onClick={() => {
              setForm(EMPTY)
              setCreating(true)
            }}
          >
            {t('admin.operators.add')}
          </Button>
        ) : null
      }
    >
      {notice ? <Toast tone="success" title={notice} onClose={() => setNotice(null)} /> : null}
      {error ? <Toast tone="danger" title={error} /> : null}

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
              <TH>{t('admin.operators.col.lastSeen')}</TH>
              <TH>{t('admin.col.status')}</TH>
              <TH align="actions">{t('admin.col.action')}</TH>
            </TR>
          </THead>
          <TBody>
            {operators.map((operator) => (
              <TR key={operator.id}>
                <TD primary>
                  <span className={styles.cellFlow}>
                    {operator.name}
                    {operator.isSuperAdmin ? (
                      <Badge tone="brand" icon={<ShieldCheck size={12} />} dot={false}>
                        {t('admin.operators.chief')}
                      </Badge>
                    ) : null}
                    {operator.twoFactorEnabled ? null : (
                      <Badge tone="warning" icon={<ShieldOff size={12} />} dot={false}>
                        {t('admin.operators.twoFactorOff')}
                      </Badge>
                    )}
                  </span>
                </TD>
                <TD muted>{operator.email}</TD>
                <TD muted>
                  {t('admin.operators.rightsCount', {
                    granted: operator.isSuperAdmin ? rights.length : operator.rights.length,
                    total: rights.length,
                  })}
                </TD>
                <TD muted>
                  {operator.lastSeenAt ? formatDateTime(locale, operator.lastSeenAt) : '—'}
                </TD>
                <TD>
                  <Badge tone={operator.isActive ? 'success' : 'neutral'}>
                    {operator.isActive ? t('admin.operators.active') : t('admin.operators.disabled')}
                  </Badge>
                </TD>
                <TD align="actions">
                  <div className={styles.actionsCell}>
                    {mayGrant ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconStart={<Pencil size={16} />}
                        onClick={() => openEdit(operator)}
                      >
                        {t('admin.operators.edit')}
                      </Button>
                    ) : null}
                    {/* Отключение вместо удаления. Себя и главного
                        администратора отключить нельзя: систему нельзя
                        оставить без обладателя GRANT_RIGHTS. */}
                    {mayGrant && !operator.isSuperAdmin && operator.id !== me.id ? (
                      <Switch
                        label={t('admin.operators.activeSwitch')}
                        checked={operator.isActive}
                        disabled={pending}
                        onChange={(e) => toggleActive(operator, e.target.checked)}
                      />
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {/* --- Заведение -------------------------------------------------- */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('admin.operators.newTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('admin.operators.cancel')}
            </Button>
            <Button disabled={!formValid || pending} onClick={create}>
              {t('admin.operators.create')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          {error ? <Toast tone="danger" title={error} /> : null}
          <Input
            label={t('admin.operators.name')}
            placeholder={t('admin.operators.namePlaceholder')}
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
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
          <CheckboxList
            label={t('admin.operators.rights')}
            options={rightOptions}
            values={form.rights}
            onChange={(values) => setForm({ ...form, rights: values })}
            hint={t('admin.operators.rightsHint')}
          />
          <Toast
            tone="neutral"
            title={t('admin.operators.passwordNoticeTitle')}
            text={t('admin.operators.passwordNoticeText')}
          />
        </div>
      </Modal>

      {/* --- Одноразовый пароль ---------------------------------------- */}
      <Modal
        open={password !== null}
        onClose={() => setPassword(null)}
        title={t('admin.operators.passwordTitle')}
        footer={<Button onClick={() => setPassword(null)}>{t('admin.newUser.done')}</Button>}
      >
        {password ? (
          <div className={styles.stack}>
            <Toast
              tone="warning"
              title={t('admin.operators.passwordOnceTitle')}
              text={t('admin.operators.passwordOnceText', { name: password.name })}
            />
            <p className={styles.mono}>{password.value}</p>
            <Button
              variant="secondary"
              size="sm"
              iconStart={copied ? <Check size={16} /> : <Copy size={16} />}
              onClick={() => {
                void navigator.clipboard?.writeText(password.value).catch(() => undefined)
                setCopied(true)
              }}
            >
              {copied ? t('admin.newUser.copied') : t('admin.newUser.copy')}
            </Button>
          </div>
        ) : null}
      </Modal>

      {/* --- Правка прав ----------------------------------------------- */}
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
            <Button disabled={pending || editing?.isSuperAdmin} onClick={saveRights}>
              {t('admin.operators.save')}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className={styles.stack}>
            {error ? <Toast tone="danger" title={error} /> : null}
            <p className={styles.muted}>{editing.email}</p>

            <CheckboxList
              label={t('admin.operators.rights')}
              options={rightOptions}
              values={editing.isSuperAdmin ? rights : editRights}
              onChange={setEditRights}
              disabled={editing.isSuperAdmin}
            />
            {editing.isSuperAdmin ? (
              <p className={styles.kpiHint}>{t('admin.operators.superHint')}</p>
            ) : null}

            {/* Сброс второго фактора и выдача нового пароля — отдельные
                действия, а не поля формы: они применяются сразу, и
                «Сохранить» их не отменит. */}
            <Card density="dense">
              <CardHeader title={t('admin.operators.accessTitle')} />
              <div className={styles.statusBlock}>
                {editing.twoFactorEnabled ? (
                  <Badge tone="success" icon={<ShieldCheck size={12} />} dot={false}>
                    {t('admin.operators.twoFactorOn')}
                  </Badge>
                ) : (
                  <Badge tone="warning" icon={<ShieldOff size={12} />} dot={false}>
                    {t('admin.operators.twoFactorOff')}
                  </Badge>
                )}
                {editing.id === me.id ? (
                  /* Свой доступ отсюда не меняется: оба действия выдают
                     случайное значение и отзывают сессию, то есть
                     выбросили бы оператора из админки прежде, чем он
                     прочитает новый пароль. Запрет держит и сервер. */
                  <p className={styles.muted}>{t('admin.operators.selfHint')}</p>
                ) : (
                  <>
                    <p className={styles.muted}>{t('admin.operators.resetHint')}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!editing.twoFactorEnabled || pending}
                      onClick={() => setResetting2fa(editing)}
                    >
                      {t('admin.operators.reset2fa')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() => resetPassword(editing)}
                    >
                      {t('admin.operators.resetPassword')}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          </div>
        ) : null}
      </Modal>

      {/* --- Сброс второго фактора ------------------------------------- */}
      <Modal
        open={resetting2fa !== null}
        onClose={() => setResetting2fa(null)}
        title={t('admin.operators.reset2faTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetting2fa(null)}>
              {t('admin.operators.cancel')}
            </Button>
            <Button variant="danger" disabled={pending} onClick={reset2fa}>
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
    </AdminShell>
  )
}

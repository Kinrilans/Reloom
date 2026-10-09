'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'
import {
  Amount,
  Badge,
  Button,
  Card,
  CardHeader,
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
import type { FeesView } from '@/server/admin/settings'
import { AdminShell } from '../../AdminShell'
import { useAdmin } from '../../_store/AdminStore'
import { previewAction, saveFeesAction, type FeesForm } from './actions'
import styles from '../../admin.module.css'

/**
 * Комиссии.
 *
 * Две независимые ставки: пополнение и вывод. У каждой — процент,
 * фиксированная часть и минимум. Индивидуальная ставка пользователя
 * **заменяет** глобальную, не складывается с ней; это написано прямо
 * в интерфейсе, иначе оператор будет ошибаться.
 *
 * Сохранение показывает «было → стало» по каждому полю. Ставка
 * попадает в каждую последующую проводку, и опечатка в базисных
 * пунктах обнаруживается по деньгам, когда их уже удержали.
 *
 * Калькулятор считает **на сервере, тем же кодом**, что и зачисление:
 * второй расчёт «для показа» однажды разойдётся с первым.
 */

const FIELDS = [
  { key: 'depositBps' },
  { key: 'depositFixed' },
  { key: 'depositMin' },
  { key: 'withdrawalBps' },
  { key: 'withdrawalFixed' },
  { key: 'withdrawalMin' },
  { key: 'minDeposit' },
  { key: 'minWithdrawal' },
  /* Автозачисление и его условия идут через то же сохранение, что
     и ставки: это одна настройка денег, и менять её молча нельзя. */
  { key: 'autoCredit' },
  { key: 'creditWithoutAml' },
  { key: 'amlMaxRisk' },
  { key: 'confirmations' },
] as const

type FieldKey = (typeof FIELDS)[number]['key']

function formOf(view: FeesView): FeesForm {
  return {
    depositBps: view.depositBps,
    depositFixed: view.depositFixed,
    depositMin: view.depositMin,
    withdrawalBps: view.withdrawalBps,
    withdrawalFixed: view.withdrawalFixed,
    withdrawalMin: view.withdrawalMin,
    minDeposit: view.minDeposit,
    minWithdrawal: view.minWithdrawal,
    autoCredit: view.autoCredit,
    creditWithoutAml: view.creditWithoutAml,
    amlMaxRisk: view.amlMaxRisk,
    confirmations: view.confirmations,
  }
}

export function FeesScreen({ view, amlDown }: { view: FeesView; amlDown: boolean }) {
  const { t } = useI18n()
  const { can } = useAdmin()
  const router = useRouter()
  const mayEdit = can('MANAGE_SETTINGS')

  const saved = formOf(view)
  const [form, setForm] = useState<FeesForm>(saved)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [calcAmount, setCalcAmount] = useState('1 000.00')
  const [calc, setCalc] = useState<{ fee: string; net: string }>(view.preview)

  function shown(key: FieldKey, value: string | boolean): string {
    if (typeof value === 'boolean') return value ? t('admin.fees.autoOn') : t('admin.fees.autoOff')
    return value
  }

  const changes = FIELDS.filter((field) => form[field.key] !== saved[field.key]).map((field) => ({
    key: field.key,
    label: t(`admin.fees.field.${field.key}`),
    before: shown(field.key, saved[field.key]),
    after: shown(field.key, form[field.key]),
  }))

  const autoOn = form.autoCredit

  function set(key: FieldKey, value: string | boolean) {
    setForm({ ...form, [key]: value })
    setNotice(false)
  }

  function revert() {
    setForm(saved)
    setConfirming(false)
  }

  function apply() {
    setError(null)
    startTransition(async () => {
      const result = await saveFeesAction(form)
      if (!result.ok) {
        setError(result.error ?? 'error')
        return
      }
      setConfirming(false)
      setNotice(true)
      router.refresh()
    })
  }

  function recalc(amount: string) {
    startTransition(async () => {
      const result = await previewAction(amount)
      if (result.ok) setCalc({ fee: result.fee, net: result.net })
    })
  }

  return (
    <AdminShell
      title={t('admin.fees.title')}
      note={t('admin.fees.note')}
      action={
        mayEdit ? (
          <Button
            iconStart={<Save size={18} />}
            disabled={changes.length === 0 || pending}
            onClick={() => setConfirming(true)}
          >
            {t('admin.fees.save')}
          </Button>
        ) : null
      }
    >
      {!mayEdit ? (
        <Toast
          tone="neutral"
          title={t('admin.fees.readOnlyTitle')}
          text={t('admin.fees.readOnlyText')}
        />
      ) : null}

      {error ? <Toast tone="danger" title={error} /> : null}

      {notice ? (
        <Toast
          tone="success"
          title={t('admin.fees.savedTitle')}
          text={t('admin.fees.savedText')}
          onClose={() => setNotice(false)}
        />
      ) : null}

      {changes.length > 0 ? (
        <Toast
          tone="warning"
          title={t('admin.fees.unsaved', { count: changes.length })}
          text={t('admin.fees.unsavedText')}
        />
      ) : null}

      {/* Автозачисление стоит первым и во всю ширину: это не ещё одна
          ставка, а ответ на вопрос «кто зачисляет деньги — система или
          оператор», и от него зависит смысл всего остального. */}
      <Card density="dense">
        <CardHeader
          title={t('admin.fees.autoTitle')}
          subtitle={t('admin.fees.autoSubtitle')}
          action={
            <Badge tone={autoOn ? 'success' : 'neutral'}>
              {autoOn ? t('admin.fees.autoOn') : t('admin.fees.autoOff')}
            </Badge>
          }
        />
        <div className={styles.stack}>
          <Switch
            label={t('admin.fees.autoSwitch')}
            checked={autoOn}
            disabled={!mayEdit}
            onChange={(e) => set('autoCredit', e.target.checked)}
          />
          <p className={styles.kpiHint}>{t('admin.fees.autoHint')}</p>

          {/* Что делать, когда проверка молчит. Отдельным
              переключателем, а не галочкой в подписи: это решение про
              деньги, и принимают его осознанно. По умолчанию выключено —
              сбой у стороннего сервиса не должен превращаться в канал,
              по которому к нам заходит что угодно. */}
          <Switch
            label={t('admin.fees.withoutAmlSwitch')}
            checked={form.creditWithoutAml}
            disabled={!mayEdit || !autoOn}
            onChange={(e) => set('creditWithoutAml', e.target.checked)}
          />
          <p className={styles.kpiHint}>{t('admin.fees.withoutAmlHint')}</p>

          {autoOn && amlDown ? (
            <Toast
              tone={form.creditWithoutAml ? 'danger' : 'warning'}
              title={t('admin.fees.amlDownTitle')}
              text={
                form.creditWithoutAml
                  ? t('admin.fees.amlDownPassing')
                  : t('admin.fees.amlDownText')
              }
            />
          ) : null}

          <div className={styles.grid2}>
            <Input
              label={t('admin.fees.amlMaxRisk')}
              numeric
              value={form.amlMaxRisk}
              onChange={(e) => set('amlMaxRisk', e.target.value)}
              disabled={!mayEdit || !autoOn}
              hint={t('admin.fees.amlMaxRiskHint')}
            />
            <Input
              label={t('admin.fees.confirmations')}
              numeric
              value={form.confirmations}
              onChange={(e) => set('confirmations', e.target.value)}
              disabled={!mayEdit || !autoOn}
              hint={t('admin.fees.confirmationsHint')}
            />
          </div>
        </div>
      </Card>

      <div className={styles.grid2}>
        <Card density="dense">
          <CardHeader title={t('admin.fees.depositCard')} />
          <div className={styles.stack}>
            <Input
              label={t('admin.fees.bps')}
              numeric
              value={form.depositBps}
              onChange={(e) => set('depositBps', e.target.value)}
              disabled={!mayEdit}
            />
            <Input
              label={t('admin.fees.fixed')}
              numeric
              value={form.depositFixed}
              onChange={(e) => set('depositFixed', e.target.value)}
              disabled={!mayEdit}
            />
            <Input
              label={t('admin.fees.min')}
              numeric
              value={form.depositMin}
              onChange={(e) => set('depositMin', e.target.value)}
              disabled={!mayEdit}
            />
          </div>
        </Card>

        <Card density="dense">
          <CardHeader title={t('admin.fees.withdrawalCard')} />
          <div className={styles.stack}>
            <Input
              label={t('admin.fees.bps')}
              numeric
              value={form.withdrawalBps}
              onChange={(e) => set('withdrawalBps', e.target.value)}
              disabled={!mayEdit}
            />
            <Input
              label={t('admin.fees.fixed')}
              numeric
              value={form.withdrawalFixed}
              onChange={(e) => set('withdrawalFixed', e.target.value)}
              disabled={!mayEdit}
            />
            <Input
              label={t('admin.fees.min')}
              numeric
              value={form.withdrawalMin}
              onChange={(e) => set('withdrawalMin', e.target.value)}
              disabled={!mayEdit}
            />
          </div>
        </Card>
      </div>

      <div className={styles.grid2}>
        <Card density="dense">
          <CardHeader
            title={t('admin.fees.minimumsCard')}
            subtitle={t('admin.fees.minimumsSubtitle')}
          />
          <div className={styles.stack}>
            <Input
              label={t('admin.fees.minDeposit')}
              numeric
              value={form.minDeposit}
              onChange={(e) => set('minDeposit', e.target.value)}
              disabled={!mayEdit}
              hint={t('admin.fees.minDepositHint')}
            />
            <Input
              label={t('admin.fees.minWithdrawal')}
              numeric
              value={form.minWithdrawal}
              onChange={(e) => set('minWithdrawal', e.target.value)}
              disabled={!mayEdit}
              hint={t('admin.fees.minWithdrawalHint')}
            />
          </div>
        </Card>

        <Card density="dense">
          <CardHeader title={t('admin.fees.calcTitle')} subtitle={t('admin.fees.calcSubtitle')} />
          <div className={styles.stack}>
            <Input
              label={t('admin.fees.amount')}
              numeric
              value={calcAmount}
              onChange={(e) => setCalcAmount(e.target.value)}
              onBlur={() => recalc(calcAmount)}
            />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.fees.weHold')}</span>
                <span className={styles.rowValue}>
                  <Amount value={calc.fee} currency="USD" size="caption" />
                </span>
              </div>
              <div className={[styles.row, styles.rowTotal].join(' ')}>
                <span className={styles.rowLabel}>{t('admin.fees.toCredit')}</span>
                <span className={styles.rowValue}>
                  <Amount value={calc.net} currency="USD" size="kpi" />
                </span>
              </div>
            </div>
            <p className={styles.kpiHint}>{t('admin.fees.calcHint')}</p>
          </div>
        </Card>
      </div>

      <Card density="dense">
        <CardHeader
          title={t('admin.fees.overridesTitle')}
          subtitle={t('admin.fees.overridesSubtitle')}
        />
        {view.overrides.length === 0 ? (
          <p className={styles.muted}>{t('admin.fees.noOverrides')}</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('admin.col.user')}</TH>
                <TH align="numeric">{t('admin.fees.colDeposit')}</TH>
                <TH align="numeric">{t('admin.fees.colWithdrawal')}</TH>
                <TH align="actions">{t('admin.col.action')}</TH>
              </TR>
            </THead>
            <TBody>
              {view.overrides.map((override) => (
                <TR key={override.userId}>
                  <TD primary>{override.userName}</TD>
                  <TD align="numeric">
                    {override.deposit
                      ? t('admin.fees.bpsShort', { value: override.deposit })
                      : t('admin.fees.byGlobal')}
                  </TD>
                  <TD align="numeric">
                    {override.withdrawal
                      ? t('admin.fees.bpsShort', { value: override.withdrawal })
                      : t('admin.fees.byGlobal')}
                  </TD>
                  <TD align="actions">
                    <div className={styles.actionsCell}>
                      {/* Ставка задаётся в карточке пользователя: там
                          видно его баланс и историю, а здесь — только
                          список исключений. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          router.push(`/admin/users?open=${override.userId}&filter=all`)
                        }
                      >
                        {t('admin.fees.edit')}
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* --- Подтверждение изменений ------------------------------------ */}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('admin.fees.confirmTitle')}
        size="lg"
        footer={
          <>
            {/* Возврат к сохранённым значениям, а не просто закрытие
                окна: иначе правки остаются висеть в полях незамеченными. */}
            <Button variant="secondary" onClick={revert}>
              {t('admin.fees.revert')}
            </Button>
            <Button disabled={pending} onClick={apply}>
              {t('admin.fees.confirm')}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          {error ? <Toast tone="danger" title={error} /> : null}
          <Table>
            <THead>
              <TR>
                <TH>{t('admin.fees.colParam')}</TH>
                <TH align="numeric">{t('admin.fees.colBefore')}</TH>
                <TH align="numeric">{t('admin.fees.colAfter')}</TH>
              </TR>
            </THead>
            <TBody>
              {changes.map((change) => (
                <TR key={change.key}>
                  <TD primary>{change.label}</TD>
                  <TD align="numeric" muted>
                    {change.before}
                  </TD>
                  <TD align="numeric">
                    <Badge tone="warning">{change.after}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          <p className={styles.kpiHint}>{t('admin.fees.confirmHint')}</p>
        </div>
      </Modal>
    </AdminShell>
  )
}

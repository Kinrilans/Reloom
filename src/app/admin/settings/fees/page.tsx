'use client'

import { useState } from 'react'
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
import { CREDITING, FEES, SYSTEM } from '@/fixtures/admin'
import { useAdmin } from '@/fixtures/adminStore'
import { AdminShell } from '../../AdminShell'
import styles from '../../admin.module.css'

/**
 * Комиссии.
 *
 * Две независимые ставки: пополнение и вывод. Каждая имеет глобальное
 * значение и может быть переопределена индивидуально на пользователя.
 * Индивидуальная ЗАМЕНЯЕТ глобальную, не складывается с ней — это написано
 * прямо в интерфейсе, иначе оператор будет ошибаться.
 *
 * Сохранение показывает, что именно меняется: «было → стало» по каждому
 * полю. Ставка попадает в каждую последующую проводку, и опечатка в
 * базисных пунктах обнаруживается по деньгам, когда их уже удержали.
 *
 * Калькулятор-превью показывает готовый пример из демо-данных: расчёт
 * комиссии появится на этапе 1 вместе с леджером и тестами.
 */

/** Поля и подписи для окна подтверждения. Порядок тот же, что на экране:
 *  оператор ищет строку там, где её менял. */
const FIELDS = [
  { key: 'depositBps' },
  { key: 'depositFixed' },
  { key: 'depositMin' },
  { key: 'withdrawalBps' },
  { key: 'withdrawalFixed' },
  { key: 'withdrawalMin' },
  { key: 'minDeposit' },
  { key: 'minWithdrawal' },
  /* Автозачисление и его условия идут через то же сохранение, что и
     ставки: это одна настройка денег, и менять её молча нельзя. Включение
     автозачисления попадает в окно «было → стало» наравне с процентами. */
  { key: 'autoCredit' },
  { key: 'creditWithoutAml' },
  { key: 'amlMaxRisk' },
  { key: 'confirmations' },
] as const

type FieldKey = (typeof FIELDS)[number]['key']
type FeeForm = Record<FieldKey, string>

/** Переключатель хранится строкой, как и остальные поля: окно
 *  подтверждения показывает «было → стало» одинаково для всех. */
const ON = 'on'
const OFF = 'off'

const INITIAL: FeeForm = {
  depositBps: FEES.deposit.bps,
  depositFixed: FEES.deposit.fixed,
  depositMin: FEES.deposit.min,
  withdrawalBps: FEES.withdrawal.bps,
  withdrawalFixed: FEES.withdrawal.fixed,
  withdrawalMin: FEES.withdrawal.min,
  minDeposit: FEES.minDeposit,
  minWithdrawal: FEES.minWithdrawal,
  autoCredit: CREDITING.auto ? ON : OFF,
  creditWithoutAml: CREDITING.creditWithoutAml ? ON : OFF,
  amlMaxRisk: CREDITING.amlMaxRisk,
  confirmations: CREDITING.confirmations,
}

export default function FeesPage() {
  const { t } = useI18n()
  const { can } = useAdmin()
  const mayEdit = can('MANAGE_SETTINGS')

  // Сохранённое и редактируемое разделены: по ним и строится «было → стало».
  const [saved, setSaved] = useState<FeeForm>(INITIAL)
  const [form, setForm] = useState<FeeForm>(INITIAL)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState(false)

  /** Значение для окна подтверждения: «вкл/выкл» вместо `on`/`off`. */
  function shown(key: FieldKey, value: string): string {
    if (key !== 'autoCredit' && key !== 'creditWithoutAml') return value
    return value === ON ? t('admin.fees.autoOn') : t('admin.fees.autoOff')
  }

  const changes = FIELDS.filter((f) => form[f.key] !== saved[f.key]).map((f) => ({
    key: f.key,
    label: t(`admin.fees.field.${f.key}`),
    before: shown(f.key, saved[f.key]),
    after: shown(f.key, form[f.key]),
  }))

  /* Проверка AML недоступна — автозачисление работать не может: зачислять
     непроверенное поступление «на доверии» нельзя. Оператор должен видеть
     это здесь, рядом с переключателем, а не искать в «Состоянии системы». */
  const amlDown = SYSTEM.services.some((s) => s.code === 'aml' && !s.ok)
  const autoOn = form.autoCredit === ON

  function set(key: FieldKey, value: string) {
    setForm({ ...form, [key]: value })
    setNotice(false)
  }

  function revert() {
    setForm(saved)
    setConfirming(false)
  }

  function apply() {
    setSaved(form)
    setConfirming(false)
    setNotice(true)
  }

  return (
    <AdminShell
      title={t('admin.fees.title')}
      note={t('admin.fees.note')}
      action={
        mayEdit ? (
          <Button
            iconStart={<Save size={18} />}
            disabled={changes.length === 0}
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

      {/* Автозачисление. Стоит первым и во всю ширину: это не ещё одна
          ставка, а ответ на вопрос «кто зачисляет деньги — система или
          оператор», и от него зависит смысл всего остального на экране. */}
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
            onChange={(e) => set('autoCredit', e.target.checked ? ON : OFF)}
          />
          <p className={styles.kpiHint}>{t('admin.fees.autoHint')}</p>

          {/* Что делать, когда проверка молчит. Отдельным переключателем,
              а не галочкой в подписи: это решение про деньги, и принимают
              его осознанно. По умолчанию выключено — сбой у стороннего
              сервиса не должен превращаться в канал, по которому к нам
              заходит что угодно. */}
          <Switch
            label={t('admin.fees.withoutAmlSwitch')}
            checked={form.creditWithoutAml === ON}
            disabled={!mayEdit || !autoOn}
            onChange={(e) => set('creditWithoutAml', e.target.checked ? ON : OFF)}
          />
          <p className={styles.kpiHint}>{t('admin.fees.withoutAmlHint')}</p>

          {autoOn && amlDown ? (
            <Toast
              tone={form.creditWithoutAml === ON ? 'danger' : 'warning'}
              title={t('admin.fees.amlDownTitle')}
              text={
                form.creditWithoutAml === ON
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
          <CardHeader
            title={t('admin.fees.calcTitle')}
            subtitle={t('admin.fees.calcSubtitle')}
          />
          <div className={styles.stack}>
            <Input label={t('admin.fees.amount')} numeric defaultValue={FEES.preview.gross} />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowLabel}>{t('admin.fees.weHold')}</span>
                <span className={styles.rowValue}>
                  <Amount value={FEES.preview.fee} currency="USD" size="caption" />
                </span>
              </div>
              <div className={[styles.row, styles.rowTotal].join(' ')}>
                <span className={styles.rowLabel}>{t('admin.fees.toCredit')}</span>
                <span className={styles.rowValue}>
                  <Amount value={FEES.preview.net} currency="USD" size="kpi" />
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
          action={mayEdit ? <Button variant="secondary" size="sm">{t('admin.fees.add')}</Button> : undefined}
        />
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
            {FEES.overrides.map((o) => (
              <TR key={o.userId}>
                <TD primary>{o.userName}</TD>
                <TD align="numeric">
                  {o.deposit ? t('admin.fees.bpsShort', { value: o.deposit }) : t('admin.fees.byGlobal')}
                </TD>
                <TD align="numeric">
                  {o.withdrawal
                    ? t('admin.fees.bpsShort', { value: o.withdrawal })
                    : t('admin.fees.byGlobal')}
                </TD>
                <TD align="actions">
                  <div className={styles.actionsCell}>
                    {mayEdit ? (
                      <Button variant="ghost" size="sm">
                        {t('admin.fees.edit')}
                      </Button>
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {/* --- Подтверждение изменений ------------------------------------ */}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('admin.fees.confirmTitle')}
        size="lg"
        footer={
          <>
            {/* Возврат к сохранённым значениям, а не просто закрытие окна:
                иначе правки остаются висеть в полях незамеченными. */}
            <Button variant="secondary" onClick={revert}>
              {t('admin.fees.revert')}
            </Button>
            <Button onClick={apply}>{t('admin.fees.confirm')}</Button>
          </>
        }
      >
        <div className={styles.stack}>
          <Table>
            <THead>
              <TR>
                <TH>{t('admin.fees.colParam')}</TH>
                <TH align="numeric">{t('admin.fees.colBefore')}</TH>
                <TH align="numeric">{t('admin.fees.colAfter')}</TH>
              </TR>
            </THead>
            <TBody>
              {changes.map((c) => (
                <TR key={c.key}>
                  <TD primary>{c.label}</TD>
                  <TD align="numeric" muted>
                    {c.before}
                  </TD>
                  <TD align="numeric">
                    <Badge tone="warning">{c.after}</Badge>
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

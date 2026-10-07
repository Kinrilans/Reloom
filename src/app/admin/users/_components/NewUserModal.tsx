'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button, Card, CardHeader, Input, Modal, Select, Toast } from '@/ui'
import type { SelectOption } from '@/ui'
import { useI18n } from '@/i18n'
import { COMPANIES } from '@/fixtures/admin'
import styles from '../../admin.module.css'

/**
 * Заведение пользователя.
 *
 * Окном, а не отдельной страницей: оператор заводит пользователя из
 * списка и возвращается в тот же список с теми же фильтрами.
 *
 * После создания идёт вызов эмитента с идемпотентным ключом, записанным
 * в базу ДО отправки запроса: иначе при падении процесса мы не узнаем,
 * был ли картхолдер создан, и заведём второго.
 *
 * Статус отображается честно — «на проверке», а не «готово»: он
 * подтягивается событиями, и успех показывается только после
 * подтверждённого чтения.
 */

const LINK_CODE = 'RLM-INV-7KQD-82XF'

export interface NewUserModalProps {
  open: boolean
  onClose: () => void
}

export function NewUserModal({ open, onClose }: NewUserModalProps) {
  const { t } = useI18n()
  const [created, setCreated] = useState(false)
  const [copied, setCopied] = useState(false)

  const companyOptions: SelectOption[] = COMPANIES.map((c) => ({ value: c.id, label: c.name }))

  // Закрытие возвращает окно к форме: следующий пользователь заводится
  // с чистого листа, а не с чужим кодом подключения на экране.
  function close() {
    onClose()
    setCreated(false)
    setCopied(false)
  }

  if (created) {
    return (
      <Modal
        open={open}
        onClose={close}
        title={t('admin.newUser.doneTitle')}
        size="lg"
        footer={<Button onClick={close}>{t('admin.newUser.done')}</Button>}
      >
        <div className={styles.grid2}>
          <Card density="dense">
            <CardHeader title={t('admin.newUser.checkTitle')} />
            <Toast
              tone="warning"
              title={t('admin.newUser.pendingTitle')}
              text={t('admin.newUser.pendingText')}
            />
            <p className={styles.kpiHint}>{t('admin.newUser.pendingHint')}</p>
          </Card>

          <Card density="dense">
            <CardHeader
              title={t('admin.newUser.linkTitle')}
              subtitle={t('admin.newUser.linkSubtitle')}
            />
            <p className={styles.mono}>{LINK_CODE}</p>
            <div className={styles.kpiRows}>
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                iconStart={copied ? <Check size={16} /> : <Copy size={16} />}
                onClick={() => {
                  void navigator.clipboard?.writeText(LINK_CODE).catch(() => undefined)
                  setCopied(true)
                }}
              >
                {copied ? t('admin.newUser.copied') : t('admin.newUser.copy')}
              </Button>
            </div>
          </Card>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('admin.newUser.title')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('admin.newUser.cancel')}
          </Button>
          <Button onClick={() => setCreated(true)}>{t('admin.newUser.submit')}</Button>
        </>
      }
    >
      <p className={styles.muted}>{t('admin.newUser.lead')}</p>

      {/* Три поля, и только они. Телефон, дату рождения и адрес оператор
          руками не вводит: всё, что нужно для выпуска карты, эмитент
          соберёт сам при прохождении проверки — а то, что оператор
          наберёт по памяти, придётся потом исправлять. */}
      <div className={styles.stack}>
        <Select
          label={t('admin.newUser.company')}
          options={companyOptions}
          defaultValue={COMPANIES[0]!.id}
          required
        />
        <Input
          label={t('admin.newUser.name')}
          placeholder={t('admin.newUser.namePlaceholder')}
          required
        />
        <Input
          label={t('admin.newUser.email')}
          type="email"
          placeholder="user@example.com"
          hint={t('admin.newUser.emailHint')}
          required
        />
      </div>

      <div className={styles.kpiRows}>
        <span className={styles.statusTitle}>{t('admin.newUser.whatHappens')}</span>
        <ol className={styles.muted}>
          <li>{t('admin.newUser.step1')}</li>
          <li>{t('admin.newUser.step2')}</li>
          <li>{t('admin.newUser.step3')}</li>
          <li>{t('admin.newUser.step4')}</li>
        </ol>
        <p className={styles.kpiHint}>{t('admin.newUser.keyHint')}</p>
      </div>
    </Modal>
  )
}

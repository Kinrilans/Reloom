'use client'

import { useState, useTransition } from 'react'
import { Button, Input, Modal, Select, Toast } from '@/ui'
import type { SelectOption } from '@/ui'
import { useI18n } from '@/i18n'
import { createUserAction } from '../actions'
import styles from '../../admin.module.css'

/**
 * Заведение пользователя.
 *
 * Окном, а не отдельной страницей: оператор заводит пользователя из
 * списка и возвращается в тот же список с теми же фильтрами.
 *
 * Три поля, и только они: компания, имя, почта. Телефон, дату
 * рождения и адрес оператор руками не вводит — всё, что нужно для
 * выпуска карты, эмитент соберёт сам при проверке, а набранное
 * оператором со слов придётся потом исправлять в двух местах.
 *
 * Заведение у эмитента — **следующий** шаг, а не часть этого. Оно
 * может не получиться или зависнуть, и объединять их значило бы
 * получить состояние, в котором непонятно, где человек есть, а где
 * нет. Поэтому после создания открывается его карточка, и кнопка
 * «завести у эмитента» ждёт там.
 */

export interface NewUserModalProps {
  open: boolean
  companies: { id: string; name: string }[]
  onClose: () => void
  onCreated: (userId: string) => void
}

export function NewUserModal({ open, companies, onClose, onCreated }: NewUserModalProps) {
  const { t } = useI18n()
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const companyOptions: SelectOption[] = companies.map((company) => ({
    value: company.id,
    label: company.name,
  }))

  function close() {
    onClose()
    setFullName('')
    setEmail('')
    setError(null)
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await createUserAction({ companyId, fullName, email })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setFullName('')
      setEmail('')
      onCreated(result.userId)
    })
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
          <Button
            disabled={pending || companyId === '' || fullName.trim() === '' || !email.includes('@')}
            onClick={submit}
          >
            {t('admin.newUser.submit')}
          </Button>
        </>
      }
    >
      <p className={styles.muted}>{t('admin.newUser.lead')}</p>

      {error ? <Toast tone="danger" title={error} /> : null}

      <div className={styles.stack}>
        <Select
          label={t('admin.newUser.company')}
          options={companyOptions}
          value={companyId}
          onChange={setCompanyId}
          required
        />
        <Input
          label={t('admin.newUser.name')}
          placeholder={t('admin.newUser.namePlaceholder')}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <Input
          label={t('admin.newUser.email')}
          type="email"
          placeholder="user@example.com"
          hint={t('admin.newUser.emailHint')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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

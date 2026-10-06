'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAdmin } from '@/fixtures/adminStore'
import { DemoPanel } from './DemoPanel'
import { COMPANY_PARAM, PERSONA_PARAM } from './personas'
import type { DemoState } from './personas'
import { useDemoPanel } from './useDemoPanel'

/**
 * Панель показа на стороне админки.
 *
 * Разрез по компании переключается прямо здесь. Состояние клиентской
 * части переносится через адрес: её хранилище живёт в другой раскладке.
 */
export function AdminDemoPanel() {
  const router = useRouter()
  const { companyId, setCompanyId } = useAdmin()
  const [open, setOpen] = useDemoPanel()

  // Переход с другой поверхности: компания приходит в адресе.
  useEffect(() => {
    const company = new URLSearchParams(window.location.search).get(COMPANY_PARAM)
    if (company) setCompanyId(company)
  }, [setCompanyId])

  function pick(item: DemoState) {
    setOpen(false)

    if (item.surface === 'app') {
      const query = item.scenario
        ? `${item.href.includes('?') ? '&' : '?'}${PERSONA_PARAM}=${item.scenario}`
        : ''
      router.push(`${item.href}${query}`)
      return
    }

    if (item.company) setCompanyId(item.company)
    router.push(item.href)
  }

  return (
    <DemoPanel
      open={open}
      onClose={() => setOpen(false)}
      surface="admin"
      activeCompany={companyId}
      onPick={pick}
    />
  )
}

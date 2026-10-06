'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/fixtures/store'
import { DemoPanel } from './DemoPanel'
import { COMPANY_PARAM, PERSONA_PARAM } from './personas'
import type { DemoState } from './personas'
import { useDemoPanel } from './useDemoPanel'

/**
 * Панель показа на стороне приложения.
 *
 * Состояние клиентской части переключается прямо здесь — подменой
 * сценария. Состояние админки переносится через адрес: её хранилище
 * живёт в другой раскладке и отсюда недоступно.
 */
export function AppDemoPanel() {
  const router = useRouter()
  const { scenario, setScenario } = useStore()
  const [open, setOpen] = useDemoPanel()

  // Переход с другой поверхности: сценарий приходит в адресе.
  useEffect(() => {
    const persona = new URLSearchParams(window.location.search).get(PERSONA_PARAM)
    if (persona) setScenario(persona)
  }, [setScenario])

  function pick(item: DemoState) {
    setOpen(false)

    if (item.surface === 'admin') {
      const query = item.company ? `?${COMPANY_PARAM}=${item.company}` : ''
      router.push(`${item.href}${query}`)
      return
    }

    if (item.scenario) setScenario(item.scenario)
    router.push(item.href)
  }

  return (
    <DemoPanel
      open={open}
      onClose={() => setOpen(false)}
      surface="app"
      activeScenario={scenario.id}
      onPick={pick}
    />
  )
}

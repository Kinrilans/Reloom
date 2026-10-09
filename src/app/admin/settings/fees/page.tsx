import { requireOperator } from '@/server/auth'
import { feesView } from '@/server/admin/settings'
import { systemView } from '@/server/admin/system'
import { prisma } from '@/server/db/client'
import { FeesScreen } from './FeesScreen'

/**
 * Комиссии и автозачисление.
 *
 * Переключатель автозачисления стоит здесь же, рядом со ставками, и
 * меняется тем же правом: это одна и та же настройка денежного потока.
 *
 * Состояние проверки происхождения читается с того же экрана, что и
 * «Состояние системы»: когда она молчит, автозачисление работать не
 * может, и оператор должен видеть это рядом с переключателем, а не
 * искать в другом разделе.
 */
export default async function FeesPage() {
  await requireOperator()

  const view = await feesView(prisma)
  const system = await systemView(prisma)
  const amlDown = system.services.some((service) => service.code === 'aml' && !service.ok)

  return <FeesScreen view={view} amlDown={amlDown} />
}

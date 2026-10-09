import { requireOperator } from '@/server/auth'
import { systemView } from '@/server/admin/system'
import { prisma } from '@/server/db/client'
import { SystemScreen } from './SystemScreen'

/**
 * Состояние системы.
 *
 * Технический экран для разбора проблем, и у каждой строки есть
 * переход к самой проблеме: список проблем без перехода заставляет
 * искать их руками и этим обесценивает себя.
 */
export default async function SystemPage() {
  await requireOperator()
  const view = await systemView(prisma)
  return <SystemScreen view={view} />
}

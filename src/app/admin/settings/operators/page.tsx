import { requireOperator } from '@/server/auth'
import { operatorsView } from '@/server/admin/settings'
import { prisma } from '@/server/db/client'
import { RIGHTS } from '@/server/services/rights'
import { OperatorsScreen } from './OperatorsScreen'

/**
 * Операторы и права.
 *
 * Главный администратор обладает всеми правами и единственный
 * изначально имеет `GRANT_RIGHTS`. Он может выдать это право другому.
 */
export default async function OperatorsPage() {
  await requireOperator()
  const operators = await operatorsView(prisma)
  return <OperatorsScreen operators={operators} rights={[...RIGHTS]} />
}

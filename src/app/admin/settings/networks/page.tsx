import { requireOperator } from '@/server/auth'
import { networksView } from '@/server/admin/settings'
import { prisma } from '@/server/db/client'
import { NetworksScreen } from './NetworksScreen'

/**
 * Сети и монеты.
 *
 * Адресов здесь нет, и это не упрощение интерфейса, а смена механики:
 * адрес заводит себе каждый пользователь, и адрес за ним закреплён —
 * по поступлению сразу видно, чей это платёж. Выданные адреса живут
 * в разделе «Крипто-адреса».
 *
 * Оператору здесь осталось общее для всех: открыть или закрыть пару,
 * загрузить значок монеты и задать минимальную сумму.
 */
export default async function NetworksPage() {
  await requireOperator()
  const view = await networksView(prisma)
  return <NetworksScreen networks={view.networks} syncedAt={view.syncedAt} />
}

import { cookies } from 'next/headers'
import { requireOperator } from '@/server/auth'
import { auditActions, listAudit } from '@/server/admin/journals'
import { prisma } from '@/server/db/client'
import { ALL_COMPANIES, COMPANY_COOKIE } from '../constants'
import { oneOf, pageFrom } from '../_components/params'
import { AuditScreen } from './AuditScreen'

const PAGE_SIZE = 20

/**
 * Журнал аудита.
 *
 * Записи неудаляемы: интерфейс удаления не предусматривает. Отдельно
 * выделяются корректировки баланса, выводы, изменения прав,
 * переопределения комиссий, переключение автозачисления, уничтожение
 * адреса и возврат — всё, что меняет деньги или доступ.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireOperator()
  const params = await searchParams
  const page = pageFrom(params.page)

  const cookieCompany = (await cookies()).get(COMPANY_COOKIE)?.value
  const companyId = !cookieCompany || cookieCompany === ALL_COMPANIES ? undefined : cookieCompany

  const list = await listAudit(prisma, {
    companyId,
    operatorId: oneOf(params.operator),
    action: oneOf(params.action),
    from: parseDay(oneOf(params.from)),
    to: parseDay(oneOf(params.to), 1),
    page,
    pageSize: PAGE_SIZE,
  })

  const operators = await prisma.operator.findMany({
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  })

  return (
    <AuditScreen
      rows={list.rows}
      total={list.total}
      page={page}
      pageSize={PAGE_SIZE}
      operators={operators}
      actions={await auditActions(prisma)}
    />
  )
}

function parseDay(value: string | undefined, addDays = 0): Date | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + addDays))
}

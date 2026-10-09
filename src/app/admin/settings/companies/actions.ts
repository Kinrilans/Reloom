'use server'

/**
 * Компании холдинга.
 *
 * Добавление возможно только после того, как KYB пройден с эмитентом
 * лично и получен `cl_…`: создания клиентов через их API мы не
 * используем.
 *
 * **Поля для депозитного адреса здесь нет.** Адрес выдаёт эмитент
 * после заведения компании и подтягивается сам при чтении пула.
 * Введённый руками означает пул, ушедший на чужой кошелёк.
 */

import { revalidatePath } from 'next/cache'
import { acting, requireOperator } from '@/server/auth'
import { writeAudit } from '@/server/audit'
import { prisma } from '@/server/db/client'
import { requireRight } from '@/server/services/rights'

type Result = { ok: true } | { ok: false; error: string }

export async function addCompanyAction(input: {
  name: string
  oxenClientId: string
  isActive: boolean
}): Promise<Result> {
  const operator = await requireOperator()
  requireRight(acting(operator), 'MANAGE_SETTINGS')

  const name = input.name.trim()
  const oxenClientId = input.oxenClientId.trim()
  if (name === '') return { ok: false, error: 'Название обязательно' }
  // Префикс проверяем здесь же: перепутанный идентификатор уводит
  // карты в чужой пул, и обнаруживается это по отказам.
  if (!oxenClientId.startsWith('cl_')) {
    return { ok: false, error: 'Идентификатор компании у эмитента начинается с cl_' }
  }

  const taken = await prisma.company.findUnique({ where: { oxenClientId } })
  if (taken) return { ok: false, error: 'Компания с таким cl_… уже заведена' }

  const company = await prisma.company.create({
    data: { name, oxenClientId, isActive: input.isActive },
  })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'COMPANY_ADDED',
    targetType: 'COMPANY',
    targetId: company.id,
    targetName: name,
    companyId: company.id,
    after: { name, oxenClientId, isActive: input.isActive },
  })

  revalidatePath('/admin/settings/companies')
  revalidatePath('/admin')
  return { ok: true }
}

export async function saveCompanyAction(input: {
  companyId: string
  name: string
  oxenClientId: string
  isActive: boolean
}): Promise<Result> {
  const operator = await requireOperator()
  requireRight(acting(operator), 'MANAGE_SETTINGS')

  const before = await prisma.company.findUnique({ where: { id: input.companyId } })
  if (!before) return { ok: false, error: 'Компании нет' }
  if (!input.oxenClientId.trim().startsWith('cl_')) {
    return { ok: false, error: 'Идентификатор компании у эмитента начинается с cl_' }
  }

  await prisma.company.update({
    where: { id: input.companyId },
    data: {
      name: input.name.trim(),
      oxenClientId: input.oxenClientId.trim(),
      isActive: input.isActive,
    },
  })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'COMPANY_CHANGED',
    targetType: 'COMPANY',
    targetId: before.id,
    targetName: input.name.trim(),
    companyId: before.id,
    before: { name: before.name, oxenClientId: before.oxenClientId, isActive: before.isActive },
    after: { name: input.name.trim(), oxenClientId: input.oxenClientId.trim(), isActive: input.isActive },
  })

  revalidatePath('/admin/settings/companies')
  revalidatePath('/admin')
  return { ok: true }
}

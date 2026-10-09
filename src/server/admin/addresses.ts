/**
 * Реестр крипто-адресов, выданных пользователям.
 *
 * Уничтоженный адрес остаётся в реестре: поступления по нему — часть
 * истории, и стирать её нельзя. Поэтому фильтр по состоянию здесь не
 * удобство, а единственный способ отделить рабочие адреса от
 * погашенных.
 */

import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import { shortAddress } from '../services/addresses'
import { depositCountsByAddress } from './aggregates'

export type AddressFilter = 'all' | 'ACTIVE' | 'BURNED'

export interface AddressRow {
  id: string
  address: string
  short: string
  memo: string | null
  asset: string
  network: string
  networkId: string
  userId: string
  userName: string
  companyId: string
  companyName: string
  status: string
  burnReasonCode: string | null
  deposits: number
  lastDepositAt: string | null
  amlVerdict: string | null
  createdAt: string
}

export interface ListAddressesQuery {
  companyId?: string | undefined
  status: AddressFilter
  networkId?: string | undefined
  search?: string | undefined
  page: number
  pageSize: number
}

export async function listAddresses(
  prisma: PrismaClient,
  query: ListAddressesQuery,
): Promise<{ rows: AddressRow[]; total: number }> {
  const where: Prisma.DepositAddressWhereInput = {}
  const userWhere: Prisma.UserWhereInput = {}
  if (query.companyId) userWhere.companyId = query.companyId
  if (query.status !== 'all') where.status = query.status
  if (query.networkId) where.networkId = query.networkId
  if (query.search && query.search.trim() !== '') {
    const search = query.search.trim()
    // Ищут и по адресу, и по человеку: оператор приходит сюда либо
    // с адресом из обозревателя, либо с именем из обращения.
    where.OR = [
      { address: { contains: search, mode: 'insensitive' } },
      { user: { fullName: { contains: search, mode: 'insensitive' } } },
    ]
  }
  if (Object.keys(userWhere).length > 0) where.user = userWhere

  const total = await prisma.depositAddress.count({ where })
  const rows = await prisma.depositAddress.findMany({
    where,
    include: {
      user: { include: { company: { select: { name: true } } } },
      network: true,
    },
    orderBy: { createdAt: 'desc' },
    skip: query.page * query.pageSize,
    take: query.pageSize,
  })

  const counts = await depositCountsByAddress(prisma, rows.map((row) => row.id))
  const verdicts = await lastVerdicts(prisma, rows.map((row) => row.id))

  return {
    total,
    rows: rows.map((row) => {
      const count = counts.get(row.id)
      return {
        id: row.id,
        address: row.address,
        short: shortAddress(row.address),
        memo: row.memo,
        asset: row.network.asset,
        network: row.network.name,
        networkId: row.networkId,
        userId: row.userId,
        userName: row.user.fullName,
        companyId: row.user.companyId,
        companyName: row.user.company.name,
        status: row.status,
        burnReasonCode: row.burnReason,
        deposits: count?.count ?? 0,
        lastDepositAt: count?.lastAt?.toISOString() ?? null,
        amlVerdict: verdicts.get(row.id) ?? null,
        createdAt: row.createdAt.toISOString(),
      }
    }),
  }
}

/** Вердикт последней проверки по каждому адресу. */
async function lastVerdicts(
  prisma: PrismaClient,
  addressIds: string[],
): Promise<Map<string, string>> {
  if (addressIds.length === 0) return new Map()
  const rows = await prisma.depositRequest.findMany({
    where: { addressId: { in: addressIds }, amlVerdict: { not: null } },
    select: { addressId: true, amlVerdict: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  const result = new Map<string, string>()
  for (const row of rows) {
    if (!result.has(row.addressId) && row.amlVerdict) result.set(row.addressId, row.amlVerdict)
  }
  return result
}

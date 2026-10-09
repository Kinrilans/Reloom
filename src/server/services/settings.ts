/**
 * Настройки платформы.
 *
 * Строка одна, идентификатор фиксированный: две конкурирующие записи
 * настроек — это две разные комиссии у двух операторов.
 *
 * Любое изменение проходит через `updateSettings`, и каждое попадает
 * в аудит снимком «было → стало». Ставка уходит в каждую последующую
 * проводку, и опечатка в базисных пунктах обнаруживается по деньгам,
 * когда их уже удержали.
 */

import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import type { Minor } from '@/shared/money'
import { writeAudit } from '../audit'
import { requireRight, type ActingOperator } from './rights'


export const SETTINGS_ID = 'singleton'

export class SettingsError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'SettingsError'
    this.code = code
  }
}

/**
 * Прочитать настройки, заведя их при первом обращении.
 *
 * Значения по умолчанию стоят в схеме. Падать на отсутствующей строке
 * нельзя: первое же открытие админки на свежей базе упёрлось бы
 * в ошибку вместо экрана.
 */
export async function readSettings(prisma: PrismaClient) {
  const existing = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } })
  if (existing) return existing
  return prisma.settings.create({ data: { id: SETTINGS_ID } })
}

export interface SettingsPatch {
  depositFeeBps?: number
  depositFeeFixedMinor?: Minor
  depositFeeMinMinor?: Minor
  withdrawalFeeBps?: number
  withdrawalFeeFixedMinor?: Minor
  withdrawalFeeMinMinor?: Minor
  minDepositMinor?: Minor
  minWithdrawalMinor?: Minor
  autoCreditOn?: boolean
  creditWithoutAml?: boolean
  amlMaxRisk?: number
  confirmationsNeeded?: number
  maxActiveCards?: number
}

/** Поля, которые считаются деньгами: отрицательных значений не бывает. */
const MONEY_FIELDS = [
  'depositFeeFixedMinor',
  'depositFeeMinMinor',
  'withdrawalFeeFixedMinor',
  'withdrawalFeeMinMinor',
  'minDepositMinor',
  'minWithdrawalMinor',
] as const

/** Поля-числа и их границы. Ставка выше 100% — почти наверняка
 *  опечатка: оператор ввёл проценты там, где ждут базисные пункты. */
const NUMBER_FIELDS: Record<string, { min: number; max: number }> = {
  depositFeeBps: { min: 0, max: 10_000 },
  withdrawalFeeBps: { min: 0, max: 10_000 },
  amlMaxRisk: { min: 0, max: 100 },
  confirmationsNeeded: { min: 1, max: 100 },
  maxActiveCards: { min: 1, max: 20 },
}

export async function updateSettings(
  prisma: PrismaClient,
  operator: ActingOperator,
  patch: SettingsPatch,
): Promise<void> {
  requireRight(operator, 'MANAGE_SETTINGS')

  for (const field of MONEY_FIELDS) {
    const value = patch[field]
    if (value !== undefined && value < 0n) {
      throw new SettingsError('NEGATIVE', `Поле ${field} не может быть отрицательным`)
    }
  }
  for (const [field, bounds] of Object.entries(NUMBER_FIELDS)) {
    const value = patch[field as keyof SettingsPatch]
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new SettingsError('NOT_INTEGER', `Поле ${field} задаётся целым числом`)
    }
    if (value < bounds.min || value > bounds.max) {
      throw new SettingsError(
        'OUT_OF_RANGE',
        `Поле ${field} должно быть от ${bounds.min} до ${bounds.max}`,
      )
    }
  }

  const before = await readSettings(prisma)
  const changed = Object.entries(patch).filter(
    ([key, value]) => value !== undefined && value !== before[key as keyof typeof before],
  )
  if (changed.length === 0) return

  await prisma.settings.update({ where: { id: SETTINGS_ID }, data: patch as Prisma.SettingsUpdateInput })

  // Переключение автозачисления выделяется в аудите отдельно: это
  // решение про то, кто зачисляет деньги — система или человек.
  const action = 'autoCreditOn' in patch && patch.autoCreditOn !== before.autoCreditOn
    ? 'AUTO_CREDIT_TOGGLED'
    : 'SETTINGS_CHANGED'

  await writeAudit(prisma, {
    operatorId: operator.id,
    action,
    targetType: 'SETTINGS',
    targetId: SETTINGS_ID,
    before: Object.fromEntries(changed.map(([key]) => [key, before[key as keyof typeof before]])),
    after: Object.fromEntries(changed),
  })
}

/**
 * Пары «монета + сеть».
 *
 * Список приходит от сервиса адресов: открывать у себя сеть, в которой
 * сервис не выдаёт адрес, бессмысленно — пополнять по ней будет нечем.
 * Поэтому у списка есть отметка, когда он сверялся.
 */
export async function updateNetwork(
  prisma: PrismaClient,
  operator: ActingOperator,
  input: {
    networkId: string
    isActive?: boolean
    minDepositOn?: boolean
    minDepositMinor?: Minor | null
    iconUrl?: string | null
  },
): Promise<void> {
  requireRight(operator, 'MANAGE_SETTINGS')

  const before = await prisma.network.findUnique({ where: { id: input.networkId } })
  if (!before) throw new SettingsError('NOT_FOUND', `Сети ${input.networkId} нет`)
  if (input.minDepositMinor !== undefined && input.minDepositMinor !== null && input.minDepositMinor < 0n) {
    throw new SettingsError('NEGATIVE', 'Минимальная сумма не может быть отрицательной')
  }

  const data: Prisma.NetworkUpdateInput = {}
  if (input.isActive !== undefined) data.isActive = input.isActive
  if (input.minDepositOn !== undefined) data.minDepositOn = input.minDepositOn
  if (input.minDepositMinor !== undefined) data.minDepositMinor = input.minDepositMinor
  if (input.iconUrl !== undefined) data.iconUrl = input.iconUrl

  await prisma.network.update({ where: { id: input.networkId }, data })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'NETWORK_CHANGED',
    targetType: 'NETWORK',
    targetId: before.id,
    targetName: `${before.asset} · ${before.name}`,
    before: {
      isActive: before.isActive,
      minDepositOn: before.minDepositOn,
      minDepositMinor: before.minDepositMinor,
    },
    after: data,
  })
}

/* --------------------------------------------------------------------------
   Сверка списка пар с сервисом адресов
   -------------------------------------------------------------------------- */

/**
 * Идентификатор пары «монета + сеть».
 *
 * Собирается из кода сети у сервиса и тикера монеты, а не случайный:
 * сверка должна находить уже заведённую пару и обновлять её, а не
 * заводить вторую с тем же смыслом. Пара неразрывна — перевод не той
 * монетой теряется так же, как перевод не в той сети.
 */
export function networkId(walletNetwork: string, asset: string): string {
  return `${walletNetwork}-${asset}`.toLowerCase()
}

/**
 * Обновить список пар из сервиса адресов.
 *
 * Открывать у себя сеть, в которой сервис не выдаёт адрес,
 * бессмысленно: пополнять по ней будет нечем. Поэтому список приходит
 * от него, а не ведётся руками.
 *
 * Пары, которых у сервиса больше нет, **не удаляются и не
 * выключаются**: по ним есть история поступлений и выданные адреса.
 * Решение закрыть пару остаётся за оператором.
 *
 * Новая пара появляется **выключенной**: открыть её для пользователей —
 * решение человека, а не следствие того, что сервис её поддерживает.
 */
export async function syncNetworks(
  prisma: PrismaClient,
  operator: ActingOperator,
  assets: {
    network: string
    asset: string
    networkName: string
    iconUrl: string | undefined
    requiresMemo: boolean
  }[],
): Promise<{ added: number; updated: number }> {
  requireRight(operator, 'MANAGE_SETTINGS')

  let added = 0
  let updated = 0

  for (const asset of assets) {
    const id = networkId(asset.network, asset.asset)
    const existing = await prisma.network.findUnique({ where: { id } })
    if (existing) {
      await prisma.network.update({
        where: { id },
        data: {
          name: asset.networkName,
          // Значок, загруженный оператором, сервисом не перетирается:
          // он загружал его как раз потому, что сервис значка не дал.
          ...(asset.iconUrl && !existing.iconUrl ? { iconUrl: asset.iconUrl } : {}),
          memoLabel: asset.requiresMemo ? (existing.memoLabel ?? 'memo') : null,
        },
      })
      updated += 1
      continue
    }

    await prisma.network.create({
      data: {
        id,
        name: asset.networkName,
        asset: asset.asset,
        iconUrl: asset.iconUrl ?? null,
        memoLabel: asset.requiresMemo ? 'memo' : null,
        isActive: false,
      },
    })
    added += 1
  }

  await prisma.settings.update({
    where: { id: SETTINGS_ID },
    data: { networksSyncedAt: new Date() },
  })

  await writeAudit(prisma, {
    operatorId: operator.id,
    action: 'NETWORKS_SYNCED',
    targetType: 'SETTINGS',
    targetId: SETTINGS_ID,
    after: { added, updated },
  })

  return { added, updated }
}

/**
 * Значок монеты, загруженный оператором.
 *
 * Хранится прямо в базе строкой `data:`: отдельного хранилища файлов
 * у нас нет, а значок — это десятки килобайт, которые незачем
 * превращать в инфраструктуру. Предел размера обязателен: без него
 * в это поле однажды попадёт фотография.
 */
export const MAX_ICON_BYTES = 64 * 1024
const ICON_TYPES = ['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg']

export async function setNetworkIcon(
  prisma: PrismaClient,
  operator: ActingOperator,
  input: { networkId: string; dataUrl: string | null },
): Promise<void> {
  requireRight(operator, 'MANAGE_SETTINGS')

  if (input.dataUrl !== null) {
    const match = /^data:([^;]+);base64,/.exec(input.dataUrl)
    if (!match || !ICON_TYPES.includes(match[1] ?? '')) {
      throw new SettingsError('BAD_ICON', 'Значок должен быть картинкой png, svg, webp или jpeg')
    }
    if (input.dataUrl.length > MAX_ICON_BYTES) {
      throw new SettingsError('ICON_TOO_BIG', `Значок больше ${MAX_ICON_BYTES} байт`)
    }
  }

  await prisma.network.update({
    where: { id: input.networkId },
    data: { iconUrl: input.dataUrl },
  })
}

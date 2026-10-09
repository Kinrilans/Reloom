/**
 * Сборка внешних адаптеров для приложения.
 *
 * Одно место, где решается, какой клиент получает бизнес-логика. Три
 * причины, чтобы оно было одним:
 *
 *   * режим (`mock` / `sandbox` / `production`) читается из окружения
 *     один раз, а не в каждом вызывающем файле;
 *   * каждый клиент обёрнут журналом обмена — забыть обёртку в одном
 *     месте значит потерять разбор именно того вызова, из-за которого
 *     разбор и понадобился;
 *   * клиент живёт на процесс: внутри него троттлинг, и три клиента
 *     с тремя независимыми очередями выдали бы втрое больше запросов,
 *     чем разрешено.
 *
 * Тесты собирают клиентов сами, напрямую из адаптеров, и сюда не
 * заглядывают.
 */

import { prisma } from './db/client'
import { logged } from './exchange/logged'
import { createAmlClient, type AmlClient } from './aml'
import { createOxenClient, type OxenClient } from './oxen'
import { createWalletClient, type WalletClient } from './wallet'

const cache: {
  oxen?: OxenClient
  wallet?: WalletClient
} = {}

/**
 * Проверка происхождения знает порог риска, а порог живёт в настройках
 * и меняется оператором. Поэтому клиент кэшируется **по порогу**:
 * один общий означал бы, что изменённый порог применится только после
 * перезапуска, а это как раз та настройка, которую меняют в ответ
 * на происходящее прямо сейчас.
 */
const amlCache = new Map<number, AmlClient>()

export function oxen(): OxenClient {
  cache.oxen ??= logged(createOxenClient(), { prisma, service: 'OXEN' })
  return cache.oxen
}

export function wallet(): WalletClient {
  cache.wallet ??= logged(createWalletClient(), { prisma, service: 'WALLET' })
  return cache.wallet
}

export function aml(maxRisk: number): AmlClient {
  const existing = amlCache.get(maxRisk)
  if (existing) return existing
  const client = logged(createAmlClient(maxRisk), { prisma, service: 'AML' })
  amlCache.set(maxRisk, client)
  return client
}

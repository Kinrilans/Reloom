/**
 * Привязка адаптера к портам домена.
 *
 * Домен знает три глагола — выставить потолок, выпустить карту,
 * поменять состояние — и ничего не знает про эмитента. Здесь эти
 * глаголы соединяются с конкретным клиентом.
 *
 * Файл намеренно тонкий: всё, что сложнее перевода вызова, относится
 * либо к домену, либо к адаптеру, но не к шву между ними.
 */

import type { Minor } from '@/shared/money'
import type { PrismaClient } from '@/generated/prisma/client'
import type { CardIssuePort, CardLimitPort, CardStatePort } from '../domain/ports'
import { markDone, markFailed, markSent, reserveIntent } from '../db/intents'
import type { OxenClient } from './types'

export function limitPort(client: OxenClient): CardLimitPort {
  return {
    async setLimit(oxenCardId: string, newLimitMinor: Minor) {
      await client.setCardLimit(oxenCardId, newLimitMinor)
    },
  }
}

export function statePort(client: OxenClient): CardStatePort {
  return {
    async freeze(oxenCardId: string) {
      await client.freezeCard(oxenCardId)
    },
    async unfreeze(oxenCardId: string) {
      await client.unfreezeCard(oxenCardId)
    },
    async cancel(oxenCardId: string) {
      await client.cancelCard(oxenCardId)
    },
  }
}

/**
 * Выпуск карты.
 *
 * Единственное место, где порт толще одной строки, и причина
 * уважительная: выпуск создаёт ресурс, а повторный выпуск создаёт
 * ВТОРУЮ карту. Поэтому намерение с идемпотентным ключом пишется
 * в базу до отправки запроса, а не после.
 *
 * `subjectId` — наш идентификатор того, подо что выпускается карта.
 * По нему намерение находится при повторе, и повтор уходит с тем же
 * ключом.
 */
export function issuePort(
  client: OxenClient,
  prisma: PrismaClient,
  subjectId: string,
): CardIssuePort {
  return {
    async issueCard(input: { oxenCardholderId: string; limitMinor: Minor }) {
      const intent = await reserveIntent(prisma, {
        service: 'OXEN',
        operation: 'ISSUE_CARD',
        subjectType: 'CARD',
        subjectId,
      })

      // Намерение уже доведено до конца — карта выпущена. Второй раз
      // не выпускаем: перечитываем.
      if (intent.completedResultId) {
        const card = await client.getCard(intent.completedResultId)
        return { oxenCardId: card.id, last4: card.last4 ?? '' }
      }

      await markSent(prisma, intent.key)
      try {
        const card = await client.issueCard(
          input.oxenCardholderId,
          { limitMinor: input.limitMinor },
          { key: intent.key },
        )
        await markDone(prisma, intent.key, card.id)
        return { oxenCardId: card.id, last4: card.last4 ?? '' }
      } catch (error) {
        await markFailed(prisma, intent.key, describe(error))
        throw error
      }
    },
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

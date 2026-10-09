/**
 * Обёртка, применяющая правила повтора к любому клиенту.
 *
 * Нужна, чтобы заглушка и живой клиент вели себя одинаково. В живом
 * клиенте повторы живут в HTTP-слое; без этой обёртки код, проверенный
 * против заглушки, увидел бы ошибки, которые на песочнице были бы
 * молча повторены и исчезли. Расхождение в поведении режимов — ровно
 * то, из-за чего переключение `mock` → `sandbox` превращается
 * в неприятный сюрприз.
 *
 * Род операции задан здесь таблицей: от него зависит, можно ли
 * повторять `502 PROVIDER_AMBIGUOUS`. На изменяющих вызовах можно,
 * на создающих — нет, там надо перечитывать.
 */

import type { Minor } from '@/shared/money'
import type { OperationKind } from './errors'
import { runWithRecovery, type RecoveryOptions } from './recovery'
import type {
  Intent,
  OxenCard,
  OxenCardholder,
  OxenClient,
  OxenClientInfo,
  OxenEventPage,
  OxenFunding,
  OxenSecrets,
  OxenTransaction,
} from './types'

const KIND: Record<keyof OxenClient, OperationKind> = {
  getFunding: 'READ',
  getClient: 'READ',
  getCardholder: 'READ',
  getCard: 'READ',
  getTransaction: 'READ',
  listEvents: 'READ',
  createCardholder: 'CREATE',
  issueCard: 'CREATE',
  setCardLimit: 'MUTATE',
  freezeCard: 'MUTATE',
  unfreezeCard: 'MUTATE',
  cancelCard: 'MUTATE',
  createSecretsSession: 'MUTATE',
}

export function retrying(
  client: OxenClient,
  options: Partial<RecoveryOptions> = {},
): OxenClient {
  const settings: RecoveryOptions = {
    maxRetries: options.maxRetries ?? 3,
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    ...(options.onUnauthorized ? { onUnauthorized: options.onUnauthorized } : {}),
  }

  const run = <T>(op: keyof OxenClient, attempt: () => Promise<T>): Promise<T> =>
    runWithRecovery(KIND[op], attempt, settings)

  return {
    getFunding: (clientId: string): Promise<OxenFunding> =>
      run('getFunding', () => client.getFunding(clientId)),
    getClient: (clientId: string): Promise<OxenClientInfo> =>
      run('getClient', () => client.getClient(clientId)),

    createCardholder: (
      clientId: string,
      input: { fullName: string; email?: string },
      intent: Intent,
    ): Promise<OxenCardholder> =>
      run('createCardholder', () => client.createCardholder(clientId, input, intent)),

    getCardholder: (id: string): Promise<OxenCardholder> =>
      run('getCardholder', () => client.getCardholder(id)),

    issueCard: (
      cardholderId: string,
      input: { limitMinor: Minor },
      intent: Intent,
    ): Promise<OxenCard> => run('issueCard', () => client.issueCard(cardholderId, input, intent)),

    getCard: (cardId: string): Promise<OxenCard> => run('getCard', () => client.getCard(cardId)),

    setCardLimit: (cardId: string, limitMinor: Minor): Promise<OxenCard> =>
      run('setCardLimit', () => client.setCardLimit(cardId, limitMinor)),

    freezeCard: (cardId: string): Promise<OxenCard> =>
      run('freezeCard', () => client.freezeCard(cardId)),

    unfreezeCard: (cardId: string): Promise<OxenCard> =>
      run('unfreezeCard', () => client.unfreezeCard(cardId)),

    cancelCard: (cardId: string): Promise<OxenCard> =>
      run('cancelCard', () => client.cancelCard(cardId)),

    getTransaction: (id: string): Promise<OxenTransaction> =>
      run('getTransaction', () => client.getTransaction(id)),

    listEvents: (cursor: string | null): Promise<OxenEventPage> =>
      run('listEvents', () => client.listEvents(cursor)),

    createSecretsSession: (cardId: string, sessionId: string): Promise<OxenSecrets> =>
      run('createSecretsSession', () => client.createSecretsSession(cardId, sessionId)),
  }
}

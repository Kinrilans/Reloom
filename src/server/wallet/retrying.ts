/**
 * Обёртка, применяющая правила повтора к любому клиенту кошелька.
 *
 * Нужна, чтобы заглушка и живой клиент вели себя одинаково: в живом
 * повторы живут в HTTP-слое, и без обёртки код, проверенный против
 * заглушки, увидел бы ошибки, которые на живом API были бы повторены
 * и исчезли.
 *
 * Род операции задан таблицей. `createAddress` и `sendRefund` —
 * создающие, и повторять их нельзя: первый заведёт второй адрес,
 * второй отправит деньги дважды.
 */

import type { OperationKind } from '@/shared/outbound'
import { runWithRecovery, type RecoveryOptions } from './recovery'
import type {
  IncomingPage,
  IncomingTransfer,
  Intent,
  Refund,
  WalletAddress,
  WalletAsset,
  WalletClient,
} from './types'

const KIND: Record<keyof WalletClient, OperationKind> = {
  listAssets: 'READ',
  getIncoming: 'READ',
  listIncoming: 'READ',
  getRefund: 'READ',
  createAddress: 'CREATE',
  sendRefund: 'CREATE',
}

export function retrying(
  client: WalletClient,
  options: Partial<RecoveryOptions> = {},
): WalletClient {
  const settings: RecoveryOptions = {
    maxRetries: options.maxRetries ?? 3,
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    ...(options.onRateLimited ? { onRateLimited: options.onRateLimited } : {}),
  }

  const run = <T>(op: keyof WalletClient, attempt: () => Promise<T>): Promise<T> =>
    runWithRecovery(KIND[op], attempt, settings)

  return {
    listAssets: (): Promise<WalletAsset[]> => run('listAssets', () => client.listAssets()),

    createAddress: (
      input: { network: string; asset: string; reference: string },
      intent: Intent,
    ): Promise<WalletAddress> => run('createAddress', () => client.createAddress(input, intent)),

    getIncoming: (chainTxId: string): Promise<IncomingTransfer> =>
      run('getIncoming', () => client.getIncoming(chainTxId)),

    listIncoming: (cursor: string | null): Promise<IncomingPage> =>
      run('listIncoming', () => client.listIncoming(cursor)),

    sendRefund: (input: { chainTxId: string; toAddress: string }, intent: Intent): Promise<Refund> =>
      run('sendRefund', () => client.sendRefund(input, intent)),

    getRefund: (refundId: string): Promise<Refund> => run('getRefund', () => client.getRefund(refundId)),
  }
}

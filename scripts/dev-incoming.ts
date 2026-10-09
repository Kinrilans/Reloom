/**
 * Дымовой прогон: поступление на адрес пользователя.
 *
 * Делает то, что в продукте делают пользователь и сервис адресов:
 * заводит адрес и присылает поступление. Нужен, пока клиентская часть
 * (этап 5) не умеет этого сама.
 *
 *     pnpm tsx scripts/dev-incoming.ts <почта> <сумма>
 */

import 'dotenv/config'
import { prisma } from '../src/server/db/client'
import { oxen, wallet } from '../src/server/deps'
import { limitPort } from '../src/server/oxen/ports'
import { registerIncoming } from '../src/server/services/deposits'
import { parseMinor } from '../src/shared/money'

async function main(): Promise<void> {
  const email = process.argv[2] ?? ''
  const amount = process.argv[3] ?? '1000.00'

  const user = await prisma.user.findFirstOrThrow({ where: { email } })
  const network = await prisma.network.findFirstOrThrow({ where: { isActive: true } })

  const [walletNetwork, asset] = network.id.split('-')
  const issued = await wallet().createAddress(
    { network: walletNetwork ?? 'tron', asset: asset?.toUpperCase() ?? 'USDT', reference: user.id },
    { key: `addr-${user.id}` },
  )

  const address =
    (await prisma.depositAddress.findFirst({ where: { userId: user.id, status: 'ACTIVE' } })) ??
    (await prisma.depositAddress.create({
      data: {
        userId: user.id,
        networkId: network.id,
        address: issued.address,
        memo: issued.memo ?? null,
      },
    }))

  const result = await registerIncoming(prisma, limitPort(oxen()), {
    chainTxId: `chain-${Date.now()}`,
    addressId: address.id,
    receivedMinor: parseMinor(amount),
    fromAddress: 'TSenderDemoAddress',
    txLink: 'https://tronscan.org/#/transaction/demo',
    amlVerdict: 'PASSED',
    amlRisk: 12,
  })

  console.log('поступление зарегистрировано:', result)
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())

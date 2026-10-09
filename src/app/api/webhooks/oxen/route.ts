/**
 * Приём вебхуков эмитента.
 *
 * Порядок здесь не косметический, нарушать его нельзя:
 *
 * 1. Взять **сырые байты** тела.
 * 2. Прочитать идентификатор события из заголовка.
 * 3. Проверить подпись по сырым байтам.
 * 4. Только после этого разбирать JSON.
 *
 * `request.text()` в App Router отдаёт тело как есть: автоматического
 * разбора, который был бы в Pages Router, здесь нет, и отключать
 * нечего. Но брать `request.json()` нельзя — после разбора и повторной
 * сборки байты другие, и подпись перестанет сходиться.
 *
 * Событие **сначала сохраняется, потом обрабатывается**. Обратный
 * порядок означает, что упавший на обработке процесс теряет событие
 * навсегда: повторной доставки у эмитента нет.
 *
 * Ответ отдаём быстро и не ждём обработки: эмитент не повторяет
 * доставку, а долгий ответ рискует оборваться по таймауту на их
 * стороне. Применением занимается догон, который и так крутится.
 */

import { createOxenClient } from '@/server/oxen'
import { prisma } from '@/server/db/client'
import { applyEvent, ingest, markFailed, markProcessed, redactForStorage, verifyWebhook, webhookBodySchema } from '@/server/events'

// Роут обязан идти на Node: проверка подписи использует `node:crypto`,
// а сырые байты тела в edge-окружении доступны иначе.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.OXEN_WEBHOOK_SECRET
  if (!secret) {
    // Без секрета проверить подпись нечем. Принимать неподписанное
    // нельзя: эндпоинт открыт всему интернету.
    console.error('webhook', { reason: 'OXEN_WEBHOOK_SECRET не задан' })
    return new Response('not configured', { status: 500 })
  }

  const raw = await request.text()
  const checked = verifyWebhook(raw, request.headers, secret)
  if (!checked.ok) {
    console.warn('webhook', { reason: checked.reason })
    return new Response('bad signature', { status: 401 })
  }

  const parsed = webhookBodySchema.safeParse(safeJson(raw))
  if (!parsed.success) {
    return new Response('bad body', { status: 400 })
  }

  // Идентификатор берём из заголовка: он задокументирован, и именно
  // он прошёл проверку подписи. Если в теле он тоже есть и отличается,
  // это повод не доверять телу.
  if (parsed.data.id && parsed.data.id !== checked.eventId) {
    console.warn('webhook', { reason: 'идентификатор в теле не совпал с заголовком' })
    return new Response('id mismatch', { status: 400 })
  }

  const stored = await ingest(prisma, {
    id: checked.eventId,
    type: parsed.data.type,
    // Одноразовые коды в базу не попадают ни при каких условиях.
    data: redactForStorage(parsed.data.type, parsed.data.data),
  })

  // Уже обработано — повтор доставки штатен и ничего не меняет.
  if (stored.alreadyProcessed) return new Response('ok', { status: 200 })

  // Пробуем применить сразу: так данные появляются у человека
  // в секунду события, а не через цикл догона. Не вышло — событие
  // остаётся в очереди, и его подберёт догон.
  try {
    await applyEvent({ prisma, oxen: createOxenClient() }, {
      id: checked.eventId,
      type: parsed.data.type,
      data: parsed.data.data,
    })
    await markProcessed(prisma, checked.eventId)
  } catch (error) {
    await markFailed(prisma, checked.eventId, error instanceof Error ? error.message : String(error))
  }

  return new Response('ok', { status: 200 })
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

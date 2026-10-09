/**
 * События эмитента: приём, догон, обработка.
 *
 * Доставка вебхуков одноразовая и без повторов — потерянное событие
 * восстанавливается только догоном, и потому догон обязателен
 * с первого дня.
 */

export { verifyWebhook, sign, EVENT_ID_HEADER, SIGNATURE_HEADER } from './signature'
export type { SignatureResult } from './signature'

export { ingest, markProcessed, markFailed, pending } from './ingest'
export type { IngestInput, IngestResult } from './ingest'

export { applyEvent, EventError } from './apply'
export type { ApplyDeps, ApplyOutcome, StoredEvent } from './apply'

export { catchUp, drainQueue, catchupStatus, CURSOR_ID } from './catchup'
export type { CatchupResult, CatchupStatus } from './catchup'

export { redactForStorage, isSecretBearing } from './redact'
export { webhookBodySchema, UNVERIFIED } from './schemas'

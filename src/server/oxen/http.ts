/**
 * HTTP-клиент эмитента.
 *
 * Единственное место в системе, где уходит запрос к Oxen. Здесь
 * собрано всё, что иначе разъехалось бы по вызовам и разошлось:
 * авторизация, разбор конверта, `requestId` в логах, троттлинг,
 * таксономия ошибок и правила повтора.
 */

import { Throttle, type OperationKind } from '@/shared/outbound'
import { OxenError, KNOWN_CODES } from './errors'
import { runWithRecovery } from './recovery'
import { envelopeSchema, errorBodySchema } from './schemas'

export interface HttpConfig {
  baseUrl: string
  apiKey: string
  /** Сколько раз повторять то, что повторять разрешено. */
  maxRetries?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  /** Куда писать `requestId`. По умолчанию — в консоль. */
  log?: (line: string, fields: Record<string, unknown>) => void
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT'
  path: string
  kind: OperationKind
  query?: Record<string, string | number | undefined>
  body?: unknown
  /** Обязателен на создающих запросах, на остальных не принимается. */
  idempotencyKey?: string
}

export class OxenHttp {
  readonly throttle: Throttle

  private readonly config: Required<Omit<HttpConfig, 'fetchImpl' | 'sleep' | 'log'>> &
    Pick<HttpConfig, 'fetchImpl' | 'sleep' | 'log'>

  constructor(config: HttpConfig, throttle = new Throttle()) {
    this.config = { ...config, maxRetries: config.maxRetries ?? 3 }
    this.throttle = throttle
  }

  /**
   * Запрос с разбором конверта и повторами по allow-list.
   *
   * Сам цикл повторов живёт в `recovery.ts` — один на весь адаптер,
   * чтобы заглушка и живой клиент вели себя одинаково.
   */
  async request(options: RequestOptions): Promise<unknown> {
    return runWithRecovery(options.kind, () => this.throttle.run(() => this.send(options)), {
      maxRetries: this.config.maxRetries,
      sleep: (ms) => this.sleep(ms),
      onUnauthorized: () => this.throttle.noteThrottleSignal(),
    })
  }

  private async send(options: RequestOptions): Promise<unknown> {
    const url = new URL(this.config.baseUrl.replace(/\/$/, '') + options.path)
    for (const [name, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value))
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      Accept: 'application/json',
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey

    const fetchImpl = this.config.fetchImpl ?? fetch
    const response = await fetchImpl(url, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body, bigintSafe),
    })

    const text = await response.text()
    const parsed = text === '' ? undefined : safeJson(text)
    const requestId = readRequestId(parsed)

    // `requestId` логируется ВСЕГДА, в том числе на успехе: именно
    // с ним обращаются в их поддержку, и искать его задним числом
    // в чужих логах уже негде.
    this.log('oxen', {
      method: options.method,
      path: options.path,
      status: response.status,
      requestId,
    })

    if (!response.ok) {
      throw toOxenError(response.status, parsed, requestId)
    }

    this.throttle.noteSuccess()
    const envelope = envelopeSchema.safeParse(parsed)
    // Конверт может и не прийти — например, на пустом ответе. Тогда
    // отдаём тело как есть, а не падаем на разборе обёртки.
    return envelope.success ? envelope.data.data : parsed
  }

  private sleep(ms: number): Promise<void> {
    return this.config.sleep
      ? this.config.sleep(ms)
      : new Promise((resolve) => setTimeout(resolve, ms))
  }

  private log(line: string, fields: Record<string, unknown>): void {
    if (this.config.log) {
      this.config.log(line, fields)
      return
    }
    // Ни тел, ни сумм, ни реквизитов — только маршрут и requestId.
    console.info(line, fields)
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function readRequestId(body: unknown): string | undefined {
  const envelope = envelopeSchema.safeParse(body)
  return envelope.success ? envelope.data._metadata?.requestId : undefined
}

/**
 * Отказ в типизированную ошибку.
 *
 * Код берётся из тела. Если тела нет или оно не разбирается, код
 * синтезируется из статуса — но так, чтобы он **не попал** в
 * allow-list повторов: неизвестное не повторяется.
 */
function toOxenError(status: number, body: unknown, requestId?: string): OxenError {
  const parsed = errorBodySchema.safeParse(body)

  if (status === 401) {
    return new OxenError({
      code: KNOWN_CODES.UNAUTHORIZED,
      message: 'ключ не принят либо сработал общий троттлинг — различить нельзя',
      httpStatus: status,
      requestId,
    })
  }

  if (!parsed.success) {
    return new OxenError({
      code: `HTTP_${status}`,
      message: 'ответ без разбираемого тела ошибки',
      httpStatus: status,
      requestId,
    })
  }

  return new OxenError({
    code: parsed.data.error.code,
    message: parsed.data.error.message ?? '',
    httpStatus: status,
    requestId,
    retryAfterSeconds: readRetryAfter(parsed.data.error.params),
    params: parsed.data.error.params,
  })
}

function readRetryAfter(params: unknown): number | undefined {
  if (typeof params !== 'object' || params === null) return undefined
  const value = (params as { retryAfterSeconds?: unknown }).retryAfterSeconds
  return typeof value === 'number' ? value : undefined
}

/** `bigint` не сериализуется в JSON сам по себе. Суммы уходят числом
 *  в минорных единицах, как и приходят. */
function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value
}

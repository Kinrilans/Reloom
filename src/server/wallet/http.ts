/**
 * HTTP-клиент сервиса крипто-адресов.
 *
 * Тонкий нарочно. Формат их запросов и ответов не подтверждён
 * (`UNVERIFIED` в `schemas.ts`), и при подключении этот файл будет
 * переписан почти целиком. Поэтому общего с эмитентом здесь только то,
 * что от формата не зависит: очередь исходящих и цикл повторов
 * (`src/shared/outbound.ts`). Обобщать транспорт поверх трёх форматов,
 * два из которых неизвестны, — значит закрепить догадки в коде.
 *
 * Ключ доступа у этого сервиса опаснее остальных: им отправляют
 * деньги. В логи не попадает ни он, ни тела запросов — только маршрут
 * и идентификатор запроса (`docs/security.md`).
 */

import { Throttle, type OperationKind } from '@/shared/outbound'
import { CODES, WalletError } from './errors'
import { runWithRecovery } from './recovery'
import { errorBodySchema } from './schemas'

export interface WalletHttpConfig {
  baseUrl: string
  apiKey: string
  maxRetries?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  log?: (line: string, fields: Record<string, unknown>) => void
}

export interface WalletRequest {
  method: 'GET' | 'POST'
  path: string
  kind: OperationKind
  query?: Record<string, string | number | undefined>
  body?: unknown
  /** Наш ключ идемпотентности. Уходит заголовком на создающих
   *  запросах; название заголовка — из непроверенного списка. */
  idempotencyKey?: string
}

export class WalletHttp {
  readonly throttle: Throttle
  private readonly config: WalletHttpConfig & { maxRetries: number }

  constructor(config: WalletHttpConfig, throttle = new Throttle()) {
    this.config = { ...config, maxRetries: config.maxRetries ?? 3 }
    this.throttle = throttle
  }

  async request(options: WalletRequest): Promise<unknown> {
    return runWithRecovery(options.kind, () => this.throttle.run(() => this.send(options)), {
      maxRetries: this.config.maxRetries,
      sleep: (ms) => this.sleep(ms),
      onRateLimited: () => this.throttle.noteThrottleSignal(),
    })
  }

  private async send(options: WalletRequest): Promise<unknown> {
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
    let response: Response
    try {
      response = await fetchImpl(url, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body, bigintSafe),
      })
    } catch (cause) {
      // Соединение не состоялось. Про состояние на их стороне не
      // известно ничего — и для отправки возврата это означает
      // «читать», а не «повторить».
      throw new WalletError({
        code: CODES.NETWORK,
        message: cause instanceof Error ? cause.message : String(cause),
        httpStatus: 0,
      })
    }

    const text = await response.text()
    const parsed = text === '' ? undefined : safeJson(text)

    this.log('wallet', {
      method: options.method,
      path: options.path,
      status: response.status,
    })

    if (!response.ok) throw toWalletError(response.status, parsed)

    this.throttle.noteSuccess()
    return parsed
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

/**
 * Отказ в типизированную ошибку.
 *
 * Их собственный код проходит насквозь, но на решение о повторе не
 * влияет: что он значит, мы не знаем. Повторяемыми считаются только
 * два случая, про которые известно наверняка, — слишком часто и
 * оборванное соединение.
 */
function toWalletError(status: number, body: unknown): WalletError {
  const parsed = errorBodySchema.safeParse(body)
  const theirCode = parsed.success ? parsed.data.code : undefined
  const message = (parsed.success ? parsed.data.message : undefined) ?? ''

  if (status === 401 || status === 403) {
    return new WalletError({
      code: CODES.UNAUTHORIZED,
      message: 'ключ не принят',
      httpStatus: status,
    })
  }

  if (status === 429) {
    return new WalletError({
      code: CODES.RATE_LIMITED,
      message,
      httpStatus: status,
      ...(parsed.success && parsed.data.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: parsed.data.retryAfterSeconds }
        : {}),
    })
  }

  return new WalletError({
    code: theirCode ?? `HTTP_${status}`,
    message,
    httpStatus: status,
  })
}

function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value
}

/**
 * Боевая реализация адаптера проверки происхождения средств.
 *
 * На живом API не проверялась: доступа пока нет. Маршрут и имена полей
 * будут выверены по списку `UNVERIFIED` при подключении.
 *
 * Здесь же принимается решение, от которого зависит, зачисляются ли
 * деньги: **что считать недоступностью сервиса, а что — нашей
 * ошибкой.** Недоступность возвращается вердиктом, у которого есть
 * своя ветка поведения; неверный ключ и испорченный запрос бросаются
 * исключением. Если бы неверный ключ тоже превращался в «сервис не
 * ответил», зачисления по всей платформе встали бы, и никто бы не
 * понял почему.
 */

import { Throttle } from '@/shared/outbound'
import { AmlError, CODES, isUnavailable } from './errors'
import { runWithRecovery } from './recovery'
import { errorBodySchema, screeningSchema } from './schemas'
import type { AmlClient, AmlRequest, AmlScreening } from './types'

export interface AmlHttpConfig {
  baseUrl: string
  apiKey: string
  /** Выше какой оценки считать проверку непройденной. Берётся из
   *  настроек админки: порог — дело владельца, а не кода. */
  maxRisk: number
  maxRetries?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  log?: (line: string, fields: Record<string, unknown>) => void
}

export class LiveAmlClient implements AmlClient {
  readonly throttle: Throttle
  private readonly config: AmlHttpConfig & { maxRetries: number }

  constructor(config: AmlHttpConfig, throttle = new Throttle()) {
    this.config = { ...config, maxRetries: config.maxRetries ?? 2 }
    this.throttle = throttle
  }

  async screen(input: AmlRequest): Promise<AmlScreening> {
    try {
      const data = await runWithRecovery('READ', () => this.throttle.run(() => this.send(input)), {
        maxRetries: this.config.maxRetries,
        sleep: (ms) => this.sleep(ms),
      })
      const parsed = screeningSchema.parse(data)
      return {
        // Сравнение с порогом — всё, что мы делаем с оценкой.
        verdict: parsed.risk > this.config.maxRisk ? 'FAILED' : 'PASSED',
        risk: parsed.risk,
        unavailableReason: undefined,
        reference: parsed.reference,
      }
    } catch (error) {
      if (error instanceof AmlError && isUnavailable(error)) {
        return {
          verdict: 'UNAVAILABLE',
          risk: undefined,
          unavailableReason: error.code,
          reference: undefined,
        }
      }
      throw error
    }
  }

  private async send(input: AmlRequest): Promise<unknown> {
    const url = new URL(this.config.baseUrl.replace(/\/$/, '') + '/screenings')
    const fetchImpl = this.config.fetchImpl ?? fetch

    let response: Response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chainTxId: input.chainTxId,
          network: input.network,
          asset: input.asset,
          amount: Number(input.amountMinor),
          fromAddress: input.fromAddress,
        }),
      })
    } catch (cause) {
      throw new AmlError({
        code: CODES.NETWORK,
        message: cause instanceof Error ? cause.message : String(cause),
        httpStatus: 0,
      })
    }

    const text = await response.text()
    const parsed = text === '' ? undefined : safeJson(text)

    this.log('aml', { status: response.status, chainTxId: input.chainTxId })

    if (!response.ok) throw toAmlError(response.status, parsed)

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

function toAmlError(status: number, body: unknown): AmlError {
  const parsed = errorBodySchema.safeParse(body)
  const message = (parsed.success ? parsed.data.message : undefined) ?? ''

  if (status === 401 || status === 403) {
    return new AmlError({ code: CODES.UNAUTHORIZED, message: 'ключ не принят', httpStatus: status })
  }
  if (status === 429) {
    return new AmlError({
      code: CODES.RATE_LIMITED,
      message,
      httpStatus: status,
      ...(parsed.success && parsed.data.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: parsed.data.retryAfterSeconds }
        : {}),
    })
  }
  if (status >= 400 && status < 500) {
    return new AmlError({ code: CODES.BAD_REQUEST, message, httpStatus: status })
  }

  return new AmlError({
    code: (parsed.success ? parsed.data.code : undefined) ?? `HTTP_${status}`,
    message,
    httpStatus: status,
  })
}

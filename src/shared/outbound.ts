/**
 * Общее для всех исходящих интеграций.
 *
 * Сервисов у нас три — эмитент карт, кошелёк и проверка происхождения
 * средств, — и правила обращения с ними одни и те же: повторять только
 * разрешённое, держать свою скорость, логировать идентификатор
 * запроса. Разные у них только списки кодов.
 *
 * Поэтому здесь лежит механика, а решение «что считать повторяемым»
 * остаётся у каждого адаптера своим. Три копии одного цикла повторов
 * через полгода превратились бы в три разных цикла, и расходиться они
 * начали бы молча.
 *
 * Прямых обращений наружу тут нет: это чистая логика без HTTP и без
 * базы.
 */

/** Как классифицирован вызов. От этого зависит, что делать при сбое. */
export type OperationKind =
  /** Создаёт ресурс или двигает деньги. Повтор создаёт второй. */
  | 'CREATE'
  /** Меняет существующее. Повтор того же запроса безвреден. */
  | 'MUTATE'
  /** Только читает. */
  | 'READ'

/** Что делать после отказа. */
export type Recovery =
  /** Повторить тот же запрос. */
  | 'RETRY'
  /** Не повторять: перечитать состояние и действовать по результату. */
  | 'REREAD'
  /** Остановиться и отдать человеку вместе с идентификатором запроса. */
  | 'STOP'

export interface OutboundErrorInit {
  code: string
  message: string
  httpStatus: number
  /** То, с чем обращаются в поддержку сервиса. Логируется всегда. */
  requestId?: string
  retryAfterSeconds?: number
  params?: unknown
}

export class OutboundError extends Error {
  readonly code: string
  readonly httpStatus: number
  readonly requestId: string | undefined
  readonly retryAfterSeconds: number | undefined
  readonly params: unknown

  constructor(init: OutboundErrorInit) {
    super(`${init.code}: ${init.message}`)
    this.name = 'OutboundError'
    this.code = init.code
    this.httpStatus = init.httpStatus
    this.requestId = init.requestId
    this.retryAfterSeconds = init.retryAfterSeconds
    this.params = init.params
  }
}

/** Сколько ждать перед повтором. */
export function retryDelayMs(error: OutboundError, attempt: number): number {
  if (typeof error.retryAfterSeconds === 'number') {
    return error.retryAfterSeconds * 1000
  }
  // Без подсказки — выдержка с ростом. Потолок нужен, чтобы фоновый
  // процесс не засыпал на полчаса.
  return Math.min(30_000, 500 * 2 ** Math.max(0, attempt - 1))
}

export interface RecoveryOptions {
  maxRetries: number
  sleep: (ms: number) => Promise<void>
  /** Решение адаптера: что делать с этим кодом при этой операции. */
  decide: (error: OutboundError, kind: OperationKind) => Recovery
  /** Код, при котором повторять нельзя ни при каких условиях и надо
   *  притормозить всю очередь. У эмитента это `401`, неотличимый от
   *  превышения общего бюджета запросов. */
  isThrottleSignal?: (error: OutboundError) => boolean
  onThrottleSignal?: () => void
}

/**
 * Цикл повторов.
 *
 * Повторяется только то, что разрешил `decide`. Неизвестный код,
 * включая любой 5xx, не повторяется никогда: цена ошибки
 * несимметрична. Не повторили то, что было можно, — лишний ручной
 * разбор. Повторили то, что было нельзя, — вторая карта или второй
 * перевод денег.
 */
export async function runWithRecovery<T>(
  kind: OperationKind,
  attempt: () => Promise<T>,
  options: RecoveryOptions,
): Promise<T> {
  let tries = 0

  for (;;) {
    tries += 1
    try {
      return await attempt()
    } catch (error) {
      if (!(error instanceof OutboundError)) throw error

      if (options.isThrottleSignal?.(error)) {
        options.onThrottleSignal?.()
        throw error
      }

      if (options.decide(error, kind) !== 'RETRY' || tries > options.maxRetries) throw error

      await options.sleep(retryDelayMs(error, tries))
    }
  }
}

/* --------------------------------------------------------------------------
   Троттлинг
   -------------------------------------------------------------------------- */

export interface ThrottleOptions {
  /** Минимальный зазор между запросами. */
  minIntervalMs: number
  /** Сколько запросов может идти одновременно. */
  concurrency: number
  /** Во сколько раз замедляться после серии отказов-сигналов. */
  slowdownFactor: number
  /** Сколько таких отказов подряд считать серией. */
  slowdownAfter: number
}

export const DEFAULT_THROTTLE: ThrottleOptions = {
  // Точных цифр рейт-лимитов мы не знаем ни по одному из сервисов —
  // это открытые вопросы к ним. До ответа держим заведомо щадящий
  // темп: лучше медленнее, чем нарваться на блокировку.
  minIntervalMs: 120,
  concurrency: 4,
  slowdownFactor: 4,
  slowdownAfter: 3,
}

/**
 * Очередь исходящих запросов.
 *
 * Одна на процесс и на сервис. Скорость держим сами, а не ждём отказа:
 * у эмитента превышение общего бюджета неотличимо от неверного ключа,
 * и узнать о нём по ответу нельзя.
 */
export class Throttle {
  private readonly options: ThrottleOptions
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  private running = 0
  private queue: (() => void)[] = []
  private nextSlotAt = 0
  private signalStreak = 0
  private slowedDown = false

  constructor(
    options: Partial<ThrottleOptions> = {},
    deps: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
  ) {
    this.options = { ...DEFAULT_THROTTLE, ...options }
    this.now = deps.now ?? (() => Date.now())
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  /** Включился ли режим замедления. Видно оператору в «Состоянии
   *  системы»: это признак, что нас притормаживают. */
  get isSlowedDown(): boolean {
    return this.slowedDown
  }

  get interval(): number {
    return this.slowedDown
      ? this.options.minIntervalMs * this.options.slowdownFactor
      : this.options.minIntervalMs
  }

  noteThrottleSignal(): void {
    this.signalStreak += 1
    if (this.signalStreak >= this.options.slowdownAfter) this.slowedDown = true
  }

  /** Успешный ответ сбрасывает серию. */
  noteSuccess(): void {
    this.signalStreak = 0
  }

  /** Вернуть обычный темп — после разбора с поддержкой. */
  resume(): void {
    this.signalStreak = 0
    this.slowedDown = false
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      const wait = this.nextSlotAt - this.now()
      if (wait > 0) await this.sleep(wait)
      this.nextSlotAt = Math.max(this.nextSlotAt, this.now()) + this.interval
      return await task()
    } finally {
      this.release()
    }
  }

  private async acquire(): Promise<void> {
    if (this.running < this.options.concurrency) {
      this.running += 1
      return
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
    this.running += 1
  }

  private release(): void {
    this.running -= 1
    const next = this.queue.shift()
    if (next) next()
  }
}

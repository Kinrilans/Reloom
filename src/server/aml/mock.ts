/**
 * Заглушка проверки происхождения средств.
 *
 * Воспроизводит все три исхода, и третий — главный: **сервис не
 * ответил.** Именно от него зависит, копятся ли поступления в очереди
 * или зачисляются без проверки, и именно он проверяет самый дорогой
 * переключатель в админке.
 *
 * Отказы задаются сценарием, а не случайностью.
 */

import { randomUUID } from 'node:crypto'
import { AmlError, CODES } from './errors'
import type { AmlClient, AmlRequest, AmlScreening } from './types'

export class MockAmlClient implements AmlClient {
  /** Оценка по умолчанию — низкая: счастливый путь не требует
   *  настройки, неприятные случаи задаются явно. */
  private defaultRisk = 5
  private readonly riskByTx = new Map<string, number>()
  private readonly riskByAddress = new Map<string, number>()
  private unavailableTimes = 0
  private unavailableReason: string = CODES.NETWORK
  private failTimes = 0
  private failError: AmlError | null = null

  readonly calls: AmlRequest[] = []

  constructor(private readonly maxRisk = 70) {}

  /** Оценка для конкретной транзакции. */
  setRisk(chainTxId: string, risk: number): void {
    this.riskByTx.set(chainTxId, risk)
  }

  /** Оценка для всех поступлений с этого адреса. */
  setRiskForAddress(fromAddress: string, risk: number): void {
    this.riskByAddress.set(fromAddress, risk)
  }

  setDefaultRisk(risk: number): void {
    this.defaultRisk = risk
  }

  /** Сервис не отвечает столько-то раз подряд. */
  failUnavailable(times = 1, reason: string = CODES.NETWORK): void {
    this.unavailableTimes = times
    this.unavailableReason = reason
  }

  /** Отказ, который недоступностью НЕ является: неверный ключ,
   *  испорченный запрос. Такое обязано дойти до человека. */
  failWith(error: AmlError, times = 1): void {
    this.failError = error
    this.failTimes = times
  }

  async screen(input: AmlRequest): Promise<AmlScreening> {
    this.calls.push(input)

    if (this.failTimes > 0 && this.failError) {
      this.failTimes -= 1
      throw this.failError
    }

    if (this.unavailableTimes > 0) {
      this.unavailableTimes -= 1
      return {
        verdict: 'UNAVAILABLE',
        risk: undefined,
        unavailableReason: this.unavailableReason,
        reference: undefined,
      }
    }

    const risk =
      this.riskByTx.get(input.chainTxId) ??
      (input.fromAddress ? this.riskByAddress.get(input.fromAddress) : undefined) ??
      this.defaultRisk

    return {
      // Единственное, что мы делаем с оценкой, — сравниваем с порогом.
      verdict: risk > this.maxRisk ? 'FAILED' : 'PASSED',
      risk,
      unavailableReason: undefined,
      reference: `scr_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    }
  }
}

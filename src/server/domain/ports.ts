/**
 * Порты наружу.
 *
 * Домен не знает, как устроен эмитент, и знать не должен. Ему нужен
 * один глагол — «выставь карте такой потолок» — и то, что за ним стоит
 * HTTP с ретраями, идемпотентными ключами и ломающимися контрактами,
 * его не касается.
 *
 * Настоящая реализация появляется на этапе 2 (`src/server/oxen`).
 * До тех пор в домен передаётся что угодно, удовлетворяющее интерфейсу;
 * в тестах — заглушка, которая умеет падать там, где нужно проверить
 * поведение при сбое.
 */

import type { Minor } from '@/shared/money'

export interface CardLimitPort {
  /**
   * Выставить карте АБСОЛЮТНЫЙ потолок.
   *
   * Не прибавку. Накопительный лимит в Oxen принимает новое значение
   * потолка, а счётчик потраченного не сбрасывается никогда
   * (CLAUDE.md, правило 3).
   */
  setLimit(oxenCardId: string, newLimitMinor: Minor): Promise<void>
}

export interface CardIssuePort {
  /** Выпустить карту. Возвращает идентификатор у эмитента. */
  issueCard(input: { oxenCardholderId: string; limitMinor: Minor }): Promise<{ oxenCardId: string; last4: string }>
}

export interface CardStatePort {
  freeze(oxenCardId: string): Promise<void>
  unfreeze(oxenCardId: string): Promise<void>
  /** Необратимо. Вызывается только при нулевом остатке и пустом резерве. */
  cancel(oxenCardId: string): Promise<void>
}

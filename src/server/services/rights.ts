/**
 * Права операторов.
 *
 * Проверка стоит **на сервере, в доменном слое**, а не только в
 * интерфейсе. Интерфейс скрывает недоступные действия, чтобы оператор
 * не тратил время, но спрятанная кнопка — это не защита: запрос можно
 * отправить и мимо неё.
 */

export const RIGHTS = [
  'MANAGE_USERS',
  'APPROVE_DEPOSITS',
  'WITHDRAW',
  'ADJUST_BALANCE',
  'MANAGE_SETTINGS',
  'MANAGE_ADDRESSES',
  'GRANT_RIGHTS',
] as const

export type Right = (typeof RIGHTS)[number]

export class RightsError extends Error {
  readonly code = 'FORBIDDEN'
  readonly right: Right

  constructor(right: Right) {
    super(`Нет права ${right}`)
    this.name = 'RightsError'
    this.right = right
  }
}

export interface ActingOperator {
  id: string
  rights: string[]
  isSuperAdmin: boolean
  isActive: boolean
}

export function has(operator: ActingOperator, right: Right): boolean {
  if (!operator.isActive) return false
  // Главный администратор обладает всеми правами. Единственное
  // исключение из точечной выдачи, и оно одно на систему.
  if (operator.isSuperAdmin) return true
  return operator.rights.includes(right)
}

/** Бросает типизированную ошибку, а не возвращает false: право
 *  проверяется там, где без него нельзя продолжать. */
export function requireRight(operator: ActingOperator, right: Right): void {
  if (!has(operator, right)) throw new RightsError(right)
}

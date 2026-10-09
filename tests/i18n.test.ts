import { describe, expect, it, vi } from 'vitest'
import { translate } from '@/i18n'

/**
 * Приёмка этапа 0 требует, чтобы переключение языка работало на тестовой
 * строке (docs/roadmap.md). Проверяется именно то, ради чего модуль
 * переводов ставится в самом начале: одна и та же строка хранится кодом
 * и превращается в текст на языке читателя, а не хранится готовым
 * текстом на чьём-то языке (CLAUDE.md, правило 3e).
 */
describe('переводы', () => {
  it('одна и та же строка читается на языке читателя', () => {
    expect(translate('en', 'common.back')).toBe('Back')
    expect(translate('ru', 'common.back')).toBe('Назад')
  })

  it('параметры подставляются в шаблон целиком, а не склейкой', () => {
    // Порядок слов в языках разный, поэтому строка не собирается из
    // кусков: подставляется только значение в готовый шаблон.
    expect(translate('en', 'incoming.button', { count: 2 })).toBe('Active transactions 2')
    expect(translate('ru', 'incoming.button', { count: 2 })).toBe('Активные транзакции 2')
  })

  it('пропавший ключ не показывается человеку сырым', () => {
    // Сырой ключ на экране хуже пустоты: он выглядит как часть
    // интерфейса и уходит в скриншоты. Пропажа видна в логе.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(translate('ru', 'такого.ключа.нет')).toBe('')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

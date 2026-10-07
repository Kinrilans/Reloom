/**
 * Переливающийся слой на лицевой стороне карты.
 *
 * Поверх фирменного градиента медленно плывут три размытых пятна. Это
 * то, что человек показывает другим, и единственное место в продукте,
 * где анимация работает не на понимание, а на впечатление
 * (docs/design-direction.md, разбор 06-vaulta-card-art).
 *
 * Три ограничения, которые нельзя снимать.
 *
 * 1. Двигаются только `transform` и `opacity`. Анимация размеров или
 *    положения пересчитывает раскладку и дёргается на слабом телефоне,
 *    а Mini App открывают на чём угодно (docs/prototype.md).
 * 2. Движение медленное — десятки секунд на цикл. Быстрое переливание
 *    на экране, куда смотрят каждый день, раздражает и читается как
 *    неисправность.
 * 3. Зелёное пятно держится приглушённым. На светлом пятне белый текст
 *    карты перестаёт читаться, а норма контраста важнее красоты.
 *
 * `prefers-reduced-motion` останавливает всё это глобально, в globals.css.
 */

import styles from './CardShader.module.css'

/** Сколько рисунков движения заготовлено. Карты у одного человека
 *  не должны переливаться одинаково — это сразу читается как шаблон. */
const VARIANTS = 3

/**
 * Номер рисунка по идентификатору карты: у одной и той же карты он
 * всегда один и тот же, на сервере и в браузере одинаковый.
 * Случайное число здесь сломало бы гидратацию.
 */
function variantOf(id: string): number {
  let sum = 0
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i)
  return (sum % VARIANTS) + 1
}

export function CardShader({ cardId }: { cardId: string }) {
  const variant = variantOf(cardId)
  return (
    <div className={[styles.shader, styles[`v${variant}`]].filter(Boolean).join(' ')} aria-hidden>
      <span className={styles.blobA} />
      <span className={styles.blobB} />
      <span className={styles.blobC} />
    </div>
  )
}

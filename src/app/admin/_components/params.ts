/**
 * Разбор параметров списка из адреса.
 *
 * Отдельным файлом без директив, потому что этим кодом пользуются
 * обе стороны: серверные страницы разбирают `searchParams`, а
 * клиентский хук собирает новый адрес. Функция, объявленная
 * в модуле с `'use client'`, со стороны сервера превращается в ссылку
 * на клиентскую сущность и при вызове падает — ошибка видна только
 * в работающем приложении, сборка её не ловит.
 */

/** Номер страницы, с нуля. Отрицательные и нечисловые значения
 *  приходят из адресной строки, и падать на них нельзя. */
export function pageFrom(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const page = Number(raw ?? '0')
  return Number.isInteger(page) && page >= 0 ? page : 0
}

/** Одно значение параметра. В адресе может прийти массив. */
export function oneOf(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === undefined || raw === '' ? undefined : raw
}

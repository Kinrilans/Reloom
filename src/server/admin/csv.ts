/**
 * Выгрузка списков в CSV.
 *
 * Два правила, оба из-за того, что файл откроют в Excel:
 *
 *   1. Разделитель — точка с запятой, а разделитель дробной части
 *      в суммах остаётся точкой. Запятая как разделитель колонок
 *      вместе с «1 234.56» рассыпает таблицу.
 *   2. Значение, начинающееся с `=`, `+`, `-` или `@`, предваряется
 *      апострофом: иначе Excel считает его формулой. Имя мерчанта
 *      приходит извне, и формулу в него можно подложить.
 *
 * Байты начинаются с BOM — без него Excel читает UTF-8 как Windows-1251
 * и показывает вопросительные знаки вместо русских букв.
 */

const BOM = '﻿'

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(cell).join(';')]
  for (const row of rows) lines.push(row.map(cell).join(';'))
  return BOM + lines.join('\r\n') + '\r\n'
}

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  if (/[";\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`
  return safe
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Выгрузка — снимок на момент запроса, и кэшировать его нельзя:
      // следующий оператор получил бы чужой отбор.
      'Cache-Control': 'no-store',
    },
  })
}

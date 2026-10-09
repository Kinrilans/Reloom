'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/ui'
import { useI18n } from '@/i18n'
import styles from '../admin.module.css'

/**
 * Пагинация списков админки.
 *
 * Списки обязаны работать на тысяче строк (docs/flows-admin.md).
 * Поэтому страницы, а не бесконечная лента: оператору нужно
 * возвращаться к тому же месту.
 *
 * Сам срез страницы делает база: компонент только показывает, где мы
 * находимся. Резать загруженный массив в памяти значило бы грузить
 * его целиком — ровно то, чего требование про тысячу строк и
 * запрещает.
 */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (next: number) => void
}) {
  const { t } = useI18n()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)

  return (
    <div className={styles.pager}>
      <span className={styles.pagerInfo}>
        {total === 0
          ? t('admin.pager.empty')
          : t('admin.pager.range', { from, to, total })}
      </span>
      <div className={styles.pagerButtons}>
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          aria-label={t('admin.pager.prev')}
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          iconStart={<ChevronLeft size={16} />}
        />
        <span className={styles.pagerInfo}>
          {page + 1} / {pages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          aria-label={t('admin.pager.next')}
          disabled={page + 1 >= pages}
          onClick={() => onPage(page + 1)}
          iconStart={<ChevronRight size={16} />}
        />
      </div>
    </div>
  )
}

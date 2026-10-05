'use client'

import { useState } from 'react'
import { Receipt } from 'lucide-react'
import { Button, Card, EmptyState, List } from '@/ui'
import { useT } from '@/i18n'
import { useStore } from '@/fixtures/store'
import { AppShell } from '../AppShell'
import { OperationRow } from '../_components/OperationRow'
import styles from '../screens.module.css'

const PAGE = 6

export default function HistoryPage() {
  const t = useT()
  const { scenario } = useStore()
  const [shown, setShown] = useState(PAGE)

  const operations = scenario.operations
  const visible = operations.slice(0, shown)
  const hasMore = shown < operations.length

  return (
    <AppShell title={t('history.title')} nav>
      {operations.length === 0 ? (
        <Card density="flush">
          <EmptyState
            icon={<Receipt size={24} />}
            title={t('history.empty.title')}
            text={t('history.empty.text')}
          />
        </Card>
      ) : (
        <>
          <List>
            {visible.map((op) => (
              <OperationRow key={op.id} operation={op} />
            ))}
          </List>

          {hasMore ? (
            <div className={styles.footer}>
              <Button variant="secondary" fullWidth onClick={() => setShown((v) => v + PAGE)}>
                {t('history.more')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  )
}

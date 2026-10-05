import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Providers } from './Providers'

export const metadata: Metadata = {
  title: 'Reloom',
}

// Состояние живёт в этой раскладке: Next сохраняет её между переходами,
// поэтому выбранный сценарий не сбрасывается при навигации по экранам.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>
}

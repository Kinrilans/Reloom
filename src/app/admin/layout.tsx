import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AdminProviders } from './AdminProviders'

export const metadata: Metadata = {
  title: 'Reloom — админка',
}

// Состояние живёт в раскладке: Next сохраняет её между переходами, поэтому
// выбранная компания не сбрасывается при навигации по разделам.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminProviders>{children}</AdminProviders>
}

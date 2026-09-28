import { requirePageCapability } from '@/lib/session'
import type { ReactNode } from 'react'

export default async function Layout({ children }: { children: ReactNode }) {
  await requirePageCapability('manageJobs')
  return children
}

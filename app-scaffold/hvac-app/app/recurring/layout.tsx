import { AuthenticatedLayout } from '@/app/components/authenticated-layout'
export { privatePageMetadata as metadata } from '@/lib/private-routes'
import { requirePageCapability } from '@/lib/session'
import type { ReactNode } from 'react'

export default async function Layout({ children }: { children: ReactNode }) {
  await requirePageCapability('manageJobs')
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>
}

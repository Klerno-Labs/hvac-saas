import type { ReactNode } from 'react'
import { AuthenticatedLayout } from '@/app/components/authenticated-layout'
export { privatePageMetadata as metadata } from '@/lib/private-routes'

export default function Layout({ children }: { children: ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>
}

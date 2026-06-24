import { requireAuth } from '@/lib/session'
import { OptionGroupForm } from './form'

export default async function NewOptionGroupPage() {
  await requireAuth()
  return <OptionGroupForm mode="create" />
}

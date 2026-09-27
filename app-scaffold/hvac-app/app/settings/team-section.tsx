'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { inviteTeamMember, removeMember, resendTeamInvitation } from './team/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

type Member = {
  id: string
  role: string
  user: { name: string | null; email: string | null }
}

type Invite = {
  id: string
  email: string
  role: string
  acceptedAt: Date | null
  expiresAt: Date
}

export function TeamSection({ members, invites, currentUserId }: {
  members: Member[]
  invites: Invite[]
  currentUserId: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendingId, setResendingId] = useState<string | null>(null)

  function showDelivery(delivery: 'sent' | 'failed') {
    if (delivery === 'sent') setSuccess('Invitation email submitted. Ask the recipient to check their inbox and spam folder.')
    else setWarning('The invitation is saved, but its email was not sent. Use Resend invitation below to try again. If delivery keeps failing, contact support.')
  }

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    const form = e.currentTarget
    setError(null)
    setSuccess(null)
    setWarning(null)
    setLoading(true)
    try {
      const result = await inviteTeamMember(new FormData(form))
      if (result.success) {
        showDelivery(result.delivery)
        form.reset()
        router.refresh()
      } else setError(result.error)
    } catch {
      setError('We could not confirm this invitation. Refresh the team list before trying again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend(inviteId: string) {
    if (resendingId) return
    setError(null)
    setSuccess(null)
    setWarning(null)
    setResendingId(inviteId)
    try {
      const result = await resendTeamInvitation(inviteId)
      if (result.success) showDelivery(result.delivery)
      else setError(result.error)
      router.refresh()
    } catch {
      setError('We could not confirm email delivery. Please try again.')
    } finally {
      setResendingId(null)
    }
  }

  async function handleRemove(memberId: string) {
    if (!confirm('Remove this team member?')) return
    const result = await removeMember(memberId)
    if (result.success) {
      router.refresh()
    } else {
      setError(result.error)
    }
  }

  const pendingInvites = invites.filter((i) => !i.acceptedAt && i.expiresAt > new Date())

  return (
    <div className="space-y-6">
      {/* Current members */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Members ({members.length})</h3>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2 border-b text-sm">
              <div>
                <span className="font-medium">{m.user.name || m.user.email}</span>
                {m.user.name && m.user.email && (
                  <span className="text-muted-foreground ml-2 text-xs">{m.user.email}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.role === 'owner' ? 'default' : 'secondary'}>{m.role}</Badge>
                {m.user.email !== members.find((mm) => mm.id === m.id)?.user.email || m.role !== 'owner' ? (
                  <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => handleRemove(m.id)}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Pending invites</h3>
          {pendingInvites.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-2 border-b text-sm">
              <span className="text-muted-foreground break-all">{inv.email}</span>
              <div className="flex items-center gap-3">
                <Badge variant="outline">{inv.role} — pending</Badge>
                <Button type="button" variant="outline" size="sm" disabled={!!resendingId || loading}
                  aria-label={`Resend invitation to ${inv.email}`} onClick={() => handleResend(inv.id)}>
                  {resendingId === inv.id ? 'Sending…' : 'Resend invitation'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invite form */}
      {error && <div role="alert" className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">{error}</div>}
      {warning && <div role="alert" className="text-sm text-amber-900 p-3 bg-amber-50 border border-amber-200 rounded-lg">{warning}</div>}
      {success && <div role="status" className="text-sm text-primary p-3 bg-primary/10 rounded-lg">{success}</div>}

      <form onSubmit={handleInvite} className="space-y-3">
        <h3 className="text-sm font-semibold">Invite a team member</h3>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="invite-email" className="sr-only">Email</Label>
            <Input id="invite-email" name="email" type="email" required placeholder="team@example.com" />
          </div>
          <select name="role" aria-label="Team member role" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="technician">Technician</option>
            <option value="dispatcher">Dispatcher</option>
            <option value="csr">CSR</option>
            <option value="office_admin">Office Admin</option>
            <option value="owner">Owner</option>
          </select>
          <Button type="submit" disabled={loading || !!resendingId}>
            {loading ? 'Sending...' : 'Invite'}
          </Button>
        </div>
      </form>
    </div>
  )
}

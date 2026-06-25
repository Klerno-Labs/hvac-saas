'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { inviteTeamMember, removeMember } from './team/actions'
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
  const [loading, setLoading] = useState(false)

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await inviteTeamMember(formData)

    if (result.success) {
      setSuccess('Invitation sent!')
      e.currentTarget.reset()
      router.refresh()
    } else {
      setError(result.error)
    }
    setLoading(false)
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
            <div key={inv.id} className="flex items-center justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">{inv.email}</span>
              <Badge variant="outline">{inv.role} — pending</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Invite form */}
      {error && <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">{error}</div>}
      {success && <div className="text-sm text-primary p-3 bg-primary/10 rounded-lg">{success}</div>}

      <form onSubmit={handleInvite} className="space-y-3">
        <h3 className="text-sm font-semibold">Invite a team member</h3>
        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="invite-email" className="sr-only">Email</Label>
            <Input id="invite-email" name="email" type="email" required placeholder="team@example.com" />
          </div>
          <select name="role" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="technician">Technician</option>
            <option value="dispatcher">Dispatcher</option>
            <option value="csr">CSR</option>
            <option value="office_admin">Office Admin</option>
            <option value="owner">Owner</option>
          </select>
          <Button type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Invite'}
          </Button>
        </div>
      </form>
    </div>
  )
}

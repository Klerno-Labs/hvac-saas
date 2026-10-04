import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AcceptInviteButton } from './accept-button'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const invite = await db.teamInvite.findUnique({
    where: { token },
    include: { organization: { select: { name: true } } },
  })

  if (!invite || invite.expiresAt <= new Date()) {
    return (
      <main className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Invalid invitation</CardTitle>
            <CardDescription>This invite link is invalid or has expired.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login" className={cn(buttonVariants(), 'no-underline')}>Go to login</Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (invite.acceptedAt) {
    redirect('/dashboard')
  }

  const session = await auth()

  // If not logged in, tell them to sign up or log in first
  if (!session?.user?.id) {
    return (
      <main className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>You&apos;re invited!</CardTitle>
            <CardDescription>
              Join <strong>{invite.organization.name}</strong> as a {invite.role}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Create an account or log in to accept this invitation.</p>
            <div className="flex justify-center gap-3">
              <Link href={`/signup?invite=${token}` as never} className={cn(buttonVariants(), 'no-underline')}>Sign up</Link>
              <Link href={`/login?invite=${token}` as never} className={cn(buttonVariants({ variant: 'outline' }), 'no-underline')}>Log in</Link>
            </div>
          </CardContent>
        </Card>
      </main>
    )
  }

  // Logged in — show accept button
  return (
    <main className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Join {invite.organization.name}</CardTitle>
          <CardDescription>You&apos;ve been invited as a {invite.role}.</CardDescription>
        </CardHeader>
        <CardContent>
          <AcceptInviteButton token={token} />
        </CardContent>
      </Card>
    </main>
  )
}

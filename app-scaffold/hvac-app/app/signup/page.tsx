'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signup } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getTradeProfile, isTradeId } from '@/lib/trades'

function SignupInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ref = searchParams.get('ref') || ''
  const invite = /^[a-f0-9]{64}$/.test(searchParams.get('invite') || '') ? searchParams.get('invite')! : ''
  const requestedTrade = searchParams.get('trade')
  const tradeType = isTradeId(requestedTrade) ? requestedTrade : 'hvac'
  const profile = getTradeProfile(tradeType)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    try {
      const result = await signup(formData)

      if (result.success) {
        // Fire-and-forget: emit signed `lead.ingest` event to Robert.
        // Must run AFTER signup() has persisted the user so we never
        // attribute a lead that was actually a validation failure. Robert
        // failures are swallowed so the login redirect is never blocked.
        const email = formData.get('email')
        if (typeof email === 'string' && email.length > 0) {
          void fetch('/api/internal/lead-ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              plan: 'trial',
              source: 'fieldclose.app/signup',
            }),
            keepalive: true,
          }).catch(() => null)
        }
        router.push(`/login?registered=true${invite ? `&invite=${invite}` : ''}`)
      } else {
        setError(result.error)
        setLoading(false)
      }
    } catch {
      setError('We could not finish creating your account. Please try again, or log in if your account was created.')
      setLoading(false)
    }
  }

  return (
    <main className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Bring your {profile.businessLabel.toLowerCase()} jobs from first estimate to final payment.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div role="alert" className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">
              {error}
            </div>
          )}

          {ref && (
            <div className="text-sm text-primary mb-4 p-3 bg-primary/10 rounded-lg">
              🎉 You&apos;re signing up with a referral — get 30 extra days free.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="trade" value={tradeType} />
            {ref && <input type="hidden" name="ref" value={ref} />}
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" type="text" required autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Sign up'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href={invite ? `/login?invite=${invite}` : "/login"} className="text-primary font-medium hover:underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-md h-96 animate-pulse bg-muted rounded-xl mx-auto mt-20" />}>
      <SignupInner />
    </Suspense>
  )
}

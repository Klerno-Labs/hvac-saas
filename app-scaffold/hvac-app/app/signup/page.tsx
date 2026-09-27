'use client'

import { Suspense, useRef, useState } from 'react'
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
  const requestedPlan = searchParams.get('plan') === 'pro' ? 'pro' : 'starter'
  const requestedTrade = searchParams.get('trade')
  const tradeType = isTradeId(requestedTrade) ? requestedTrade : 'hvac'
  const profile = getTradeProfile(tradeType)
  const submitting = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    let saved = false
    try {
      const result = await signup(formData)

      if (result.success) {
        saved = true
        router.push(`/login?registered=true${invite ? `&invite=${invite}` : ''}`)
      } else {
        setError(result.error)
        setLoading(false)
      }
    } catch {
      setError('Account creation is temporarily unavailable. Try again shortly, or log in if you already submitted this form.')
      setLoading(false)
    } finally {
      if (!saved) submitting.current = false
    }
  }

  return (
    <main className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl"><h1>Create your account</h1></CardTitle>
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

          {!invite && <p className="mb-4 text-sm text-muted-foreground">14-day {requestedPlan === 'pro' ? 'Pro' : 'Starter'} trial. No credit card required. A paid subscription starts only when you choose it in Billing.</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="trade" value={tradeType} />
            <input type="hidden" name="plan" value={requestedPlan} />
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

          <p className="mt-5 text-sm text-muted-foreground text-center">By creating an account, you agree to our <Link href="/terms" className="underline">Terms</Link> and acknowledge our <Link href="/privacy" className="underline">Privacy Policy</Link>.</p>
          <p className="mt-4 text-center text-sm"><Link href={`/demo?${new URLSearchParams({ trade: tradeType, plan: requestedPlan }).toString()}` as never} className="underline">Explore the product tour first</Link></p>
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

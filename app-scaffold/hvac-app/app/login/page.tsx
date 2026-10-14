'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn, getProviders } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

function LoginForm() {
  const searchParams = useSearchParams()
  const registered = searchParams.get('registered') === 'true'
  const invite = /^[a-f0-9]{64}$/.test(searchParams.get('invite') || '') ? searchParams.get('invite')! : ''
  const destination = invite ? `/invite/${invite}` : '/dashboard'
  const [githubEnabled, setGithubEnabled] = useState(false)
  useEffect(() => { let active = true; getProviders().then(providers => { if (active) setGithubEnabled(Boolean(providers?.github)) }).catch(() => {}); return () => { active = false } }, [])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCredentials(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    try {
    const result = await signIn('credentials', {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      window.location.assign(destination)
    }
    } catch {
      setError('We could not log you in. Please try again.')
      setLoading(false)
    }

  }

  async function handleGitHub() {
    await signIn('github', { callbackUrl: destination })
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl"><h1>Log in</h1></CardTitle>
        <CardDescription>Welcome back.</CardDescription>
      </CardHeader>
      <CardContent>
        {registered && (
          <div className="text-sm text-primary mb-4 p-3 bg-primary/10 rounded-lg">
            Account created. Please log in.
          </div>
        )}

        {error && (
          <div role="alert" className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleCredentials} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Logging in...' : 'Log in'}
          </Button>
          <div className="text-right">
            <Link href="/forgot-password" className="text-xs text-muted-foreground hover:underline">
              Forgot password?
            </Link>
          </div>
        </form>

        {githubEnabled && <>
        <div className="relative my-6">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            or
          </span>
        </div>

        <Button variant="outline" className="w-full" onClick={handleGitHub}>
          Continue with GitHub
        </Button>
        </>}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href={invite ? `/signup?invite=${invite}` : "/signup"} className="text-primary font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <main className="flex items-center justify-center min-h-screen p-4">
      <Suspense fallback={<div className="w-full max-w-md h-96 animate-pulse bg-muted rounded-xl" />}>
        <LoginForm />
      </Suspense>
    </main>
  )
}

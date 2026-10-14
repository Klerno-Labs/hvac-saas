'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { resetPassword } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function ResetForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    formData.set('token', token)
    try {
      const result = await resetPassword(formData)
      if (result.success) setDone(true)
      else setError(result.error)
    } catch { setError('The connection was interrupted. Try logging in with your new password, or request another reset link.') }
    finally { setLoading(false) }
  }

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">
          Invalid reset link. Please request a new one.
        </p>
        <Link href="/forgot-password" className="text-sm text-primary hover:underline">
          Request new reset link
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-sm text-primary mb-4 p-3 bg-primary/10 rounded-lg">
          Password reset successfully. Please log in again on your devices.
        </p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Log in with your new password
        </Link>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div role="alert" className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Resetting...' : 'Reset password'}
        </Button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <main className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Set new password</CardTitle>
          <CardDescription>Choose a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-32 animate-pulse bg-muted rounded" />}>
            <ResetForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  )
}

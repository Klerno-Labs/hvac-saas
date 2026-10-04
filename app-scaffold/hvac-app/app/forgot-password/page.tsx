'use client'

import { useState } from 'react'
import Link from 'next/link'
import { requestPasswordReset } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    try {
      const result = await requestPasswordReset(formData)
      if (result.success) setSent(true)
      else setError(result.error)
    } catch { setError('We could not request a reset link. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <main className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl"><h1>Reset password</h1></CardTitle>
          <CardDescription>
            {sent ? 'Reset request received.' : 'Enter your email to receive a password reset link.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
          {sent ? (
            <div className="text-center">
              <p role="status" className="text-sm text-primary mb-4 p-3 bg-primary/10 rounded-lg">
                If an account matches, check your inbox and spam folder for reset instructions. If no message arrives, try again or contact support.
              </p>
              <Link href="/login" className="text-sm text-primary hover:underline">
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending...' : 'Send reset link'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="text-primary hover:underline">Back to login</Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { OnboardingForm } from './form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cookies } from 'next/headers'
import { isTradeId } from '@/lib/trades'

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ trade?: string }> }) {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (membership) {
    redirect('/dashboard')
  }

  const { trade } = await searchParams
  const cookieStore = await cookies()
  const savedTrade = cookieStore.get('fc_trade')?.value
  const initialTradeType = isTradeId(trade) ? trade : isTradeId(savedTrade) ? savedTrade : 'hvac'

  return (
    <main className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Set up your business</CardTitle>
          <CardDescription>Set up your service business and choose the trade that fits your team.</CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm initialTradeType={initialTradeType} />
        </CardContent>
      </Card>
    </main>
  )
}

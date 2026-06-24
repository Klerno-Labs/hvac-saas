import { requireAuth } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CopyReferralButton } from './copy-button'

export default async function ReferralsPage() {
  const { organization } = await requireAuth()

  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const referralLink = `${appUrl}/signup?ref=${organization.referralCode}`

  const referrals = await db.organization.findMany({
    where: { referredByOrgId: organization.id },
    select: { id: true, name: true, createdAt: true, subscriptionStatus: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="mb-8">
        <Link href="/settings" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
          &larr; Back to settings
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
        <p className="text-sm text-muted-foreground mt-1">Invite other HVAC shops. You both get a free month when they sign up.</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Your referral link</CardTitle>
          <CardDescription>Share this link. Both you and the new shop get 1 month free.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={referralLink}
              className="flex-1 px-3 py-2 border rounded-lg bg-muted text-sm font-mono"
              onFocus={(e) => e.target.select()}
            />
            <CopyReferralButton link={referralLink} />
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total referrals</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{referrals.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Free months earned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{organization.referralCredits}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Referred shops</CardTitle>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No referrals yet. Share your link to get started.</p>
          ) : (
            <div className="space-y-2">
              {referrals.map((ref) => (
                <div key={ref.id} className="flex justify-between items-center py-2 border-b">
                  <div>
                    <span className="font-medium text-sm">{ref.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      Joined {new Date(ref.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <Badge variant={ref.subscriptionStatus === 'ACTIVE' ? 'default' : 'secondary'}>
                    {ref.subscriptionStatus}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

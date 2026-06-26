import { requireAuth } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { StripeConnectSection } from './stripe-connect'
import { CollectionsSettingsSection } from './collections-settings'
import { isTwilioConfigured } from '@/lib/sms'
import { AccountingSettingsSection } from './accounting-settings'
import { TeamSection } from './team-section'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function SettingsPage() {
  const { organization, organizationId, userId } = await requireAuth()

  const [members, invites] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId },
      include: { user: { select: { name: true, email: true } } },
    }),
    db.teamInvite.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">{organization.name}</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>Manage your organization members and invitations.</CardDescription>
        </CardHeader>
        <CardContent>
          <TeamSection members={members} invites={invites} currentUserId={userId} />
        </CardContent>
      </Card>

      <StripeConnectSection
        accountId={organization.stripeConnectedAccountId}
        chargesEnabled={organization.stripeChargesEnabled}
        payoutsEnabled={organization.stripePayoutsEnabled}
        terminalEnabled={organization.stripeTerminalEnabled}
      />

      <CollectionsSettingsSection
        initialEnabled={organization.collectionsEnabled}
        initialOverdue1Days={organization.collectionsOverdue1Days}
        initialOverdue2Days={organization.collectionsOverdue2Days}
        initialFinalDays={organization.collectionsFinalDays}
        initialSmsEnabled={organization.smsEnabled}
        twilioConfigured={isTwilioConfigured()}
      />

      <AccountingSettingsSection
        initialProvider={organization.accountingProvider}
        initialConnected={organization.accountingConnected}
        lastSyncAt={organization.accountingLastSyncAt}
      />

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Billing</CardTitle>
            <CardDescription>
              {organization.plan.toLowerCase()} plan — {organization.subscriptionStatus.toLowerCase()}
            </CardDescription>
          </div>
          <Link href="/settings/billing" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}>
            Manage billing
          </Link>
        </CardHeader>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Referrals</CardTitle>
            <CardDescription>
              Invite other shops and earn free months.
            </CardDescription>
          </div>
          <Link href="/settings/referrals" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}>
            View referrals
          </Link>
        </CardHeader>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Administration</CardTitle>
          <CardDescription>Security and audit tools for organization owners.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Link href="/settings/audit" className={cn(buttonVariants({ variant: 'outline' }), 'no-underline')}>
              View audit log
            </Link>
            <Link href="/settings/export" className={cn(buttonVariants({ variant: 'outline' }), 'no-underline')}>
              Export data
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

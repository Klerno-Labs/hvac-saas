import Link from 'next/link'
import Image from 'next/image'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const SITE_URL = process.env.APP_URL || 'https://fieldclose.app'

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'FieldClose',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: 'The quote-to-payment operating system for residential HVAC businesses. Send estimates, complete jobs, invoice customers, and collect payment in one workflow.',
  url: SITE_URL,
  offers: [
    {
      '@type': 'Offer',
      name: 'Starter',
      price: '49',
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '49',
        priceCurrency: 'USD',
        unitText: 'MONTH',
      },
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '99',
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '99',
        priceCurrency: 'USD',
        unitText: 'MONTH',
      },
    },
  ],
  aggregateRating: undefined,
  featureList: [
    'AI-powered estimate drafting',
    'Customer management',
    'Job tracking and scheduling',
    'One-click invoicing',
    'Stripe payment collection',
    'Automated collections',
    'Customer portal',
    'Financial reports',
    'Inventory tracking',
    'Recurring maintenance contracts',
  ],
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Nav */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-4">
          <span className="text-xl font-bold text-primary tracking-tight">FieldClose</span>
          <div className="flex items-center gap-3">
            <Link href="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'no-underline')}>
              Log in
            </Link>
            <Link href="/signup" className={cn(buttonVariants({ size: 'sm' }), 'no-underline')}>
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
        <div className="max-w-6xl mx-auto px-4 py-20 md:py-32 relative">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="secondary" className="mb-4">Built for HVAC professionals</Badge>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-6">
                Close every job faster.<br />
                <span className="text-primary">Get paid the same day.</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                FieldClose is the quote-to-payment operating system for residential HVAC shops.
                Create estimates, complete jobs, send invoices, and collect payment — all in one workflow.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/signup" className={cn(buttonVariants({ size: 'lg' }), 'no-underline text-base px-8')}>
                  Start free trial
                </Link>
                <Link href="#pricing" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'no-underline text-base px-8')}>
                  View pricing
                </Link>
              </div>
              <p className="text-xs text-muted-foreground mt-4">No credit card required. Free 14-day trial.</p>
            </div>
            <div className="relative hidden md:block">
              <div className="rounded-2xl overflow-hidden shadow-2xl border">
                <Image
                  src="/images/hero.jpg"
                  alt="HVAC technician at work"
                  width={800}
                  height={600}
                  className="w-full h-auto"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof bar */}
      <section className="border-y bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 text-sm text-muted-foreground">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">$0</p>
              <p>Lost to slow invoicing</p>
            </div>
            <Separator orientation="vertical" className="h-8 hidden md:block" />
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">Same day</p>
              <p>Invoice to payment</p>
            </div>
            <Separator orientation="vertical" className="h-8 hidden md:block" />
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">2 min</p>
              <p>AI-drafted estimates</p>
            </div>
            <Separator orientation="vertical" className="h-8 hidden md:block" />
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">1 system</p>
              <p>Quote to payment</p>
            </div>
          </div>
        </div>
      </section>

      {/* Problem statement */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Stop losing money between the job site and the bank
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Most HVAC shops juggle paper quotes, text messages, spreadsheets, and phone calls to get paid.
            FieldClose replaces all of it with one simple workflow.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <Card className="text-center border-2 hover:border-primary/30 transition-colors">
            <CardHeader>
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl">&#9889;</span>
              </div>
              <CardTitle className="text-lg">AI-powered estimates</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Describe the job. FieldClose drafts a professional estimate with line items and pricing. Review, edit, send.
              </p>
            </CardContent>
          </Card>

          <Card className="text-center border-2 hover:border-primary/30 transition-colors">
            <CardHeader>
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl">&#10003;</span>
              </div>
              <CardTitle className="text-lg">Proof of work + invoicing</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Record what was done, create an invoice in one click. Line items auto-populate from the estimate.
              </p>
            </CardContent>
          </Card>

          <Card className="text-center border-2 hover:border-primary/30 transition-colors">
            <CardHeader>
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl">&#128176;</span>
              </div>
              <CardTitle className="text-lg">Collect payment instantly</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Send a payment link or share the customer portal. Customers pay by card. Money lands in your account.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Feature showcase with image */}
      <section className="bg-muted/30 border-y">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="rounded-2xl overflow-hidden shadow-xl border">
              <Image
                src="/images/features.jpg"
                alt="HVAC technician servicing a unit"
                width={800}
                height={600}
                className="w-full h-auto"
              />
            </div>
            <div>
              <h2 className="text-3xl font-bold tracking-tight mb-6">
                Everything from estimate to payment in one place
              </h2>
              <div className="space-y-4">
                {[
                  { title: 'Customer management', desc: 'Track every customer with contact info, address, and job history.' },
                  { title: 'Job tracking', desc: 'Create jobs, assign technicians, record completion details.' },
                  { title: 'Smart estimates', desc: 'AI drafts professional estimates. You review and send.' },
                  { title: 'One-click invoicing', desc: 'Convert completed work into invoices automatically.' },
                  { title: 'Online payments', desc: 'Stripe-powered payment links. Customers pay by card.' },
                  { title: 'Collections automation', desc: 'Automatic follow-up on overdue invoices.' },
                  { title: 'Customer portal', desc: 'Customers view estimates, invoices, and pay online.' },
                  { title: 'Financial reports', desc: 'See what you\'re owed, what\'s paid, what\'s overdue.' },
                ].map((feature) => (
                  <div key={feature.title} className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-primary text-xs">&#10003;</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{feature.title}</p>
                      <p className="text-sm text-muted-foreground">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Simple pricing. No surprises.</h2>
          <p className="text-lg text-muted-foreground">Start free. Upgrade when you're ready.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          <Card className="border-2">
            <CardHeader className="text-center">
              <CardTitle>Starter</CardTitle>
              <div className="mt-2">
                <span className="text-4xl font-bold">$49</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 mb-8">
                {['Unlimited customers', 'Unlimited jobs & estimates', 'AI estimate drafting', 'Invoice & payment collection', 'Customer portal', 'Financial reports'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <span className="text-primary">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className={cn(buttonVariants({ variant: 'outline' }), 'w-full no-underline justify-center')}>
                Start free trial
              </Link>
            </CardContent>
          </Card>

          <Card className="border-2 border-primary relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge>Most popular</Badge>
            </div>
            <CardHeader className="text-center">
              <CardTitle>Pro</CardTitle>
              <div className="mt-2">
                <span className="text-4xl font-bold">$99</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 mb-8">
                {['Everything in Starter', 'Collections automation', 'Recurring contracts', 'Team members & roles', 'Audit log & admin controls', 'Priority support'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <span className="text-primary">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className={cn(buttonVariants(), 'w-full no-underline justify-center')}>
                Start free trial
              </Link>
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          2.9% processing fee on payments collected through FieldClose. No hidden fees.
        </p>
      </section>

      {/* Testimonial / Trust */}
      <section className="bg-muted/30 border-y">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <div className="rounded-2xl overflow-hidden shadow-lg border mb-8 max-w-2xl mx-auto">
            <Image
              src="/images/trust.jpg"
              alt="Residential HVAC installation"
              width={800}
              height={400}
              className="w-full h-auto"
            />
          </div>
          <blockquote className="text-xl font-medium italic text-foreground mb-4">
            Stop chasing invoices. Stop losing track of jobs. Get paid the day the work is done.
          </blockquote>
          <p className="text-sm text-muted-foreground">Built for HVAC shops with 1-5 technicians. Started free, stayed organized, got paid faster.</p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight mb-4">
          Ready to close jobs faster?
        </h2>
        <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
          Join HVAC professionals who use FieldClose to get paid faster, track every job, and stop chasing invoices.
        </p>
        <Link href="/signup" className={cn(buttonVariants({ size: 'lg' }), 'no-underline text-base px-10')}>
          Start your free trial
        </Link>
        <p className="text-xs text-muted-foreground mt-4">14-day free trial. No credit card required.</p>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <span className="font-bold text-primary">FieldClose</span>
              <p className="text-xs text-muted-foreground mt-1">&copy; {new Date().getFullYear()} Pegrio LLC. FieldClose is a Pegrio LLC product.</p>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="/login" className="hover:text-foreground no-underline">Log in</Link>
              <Link href="/signup" className="hover:text-foreground no-underline">Sign up</Link>
              <Link href="/terms" className="hover:text-foreground no-underline">Terms</Link>
              <Link href="/privacy" className="hover:text-foreground no-underline">Privacy</Link>
              <Link href="/refund-policy" className="hover:text-foreground no-underline">Refunds</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

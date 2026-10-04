import { marketingMetadata } from '@/lib/marketing/seo'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { siteUrl } from '@/lib/marketing/site'
import { supportMailto } from '@/lib/support'
import { HelpSearch } from './help-search'
import styles from './help.module.css'

export const metadata = marketingMetadata({ title: "FieldClose Help Center", description: "Find practical FieldClose guides for setup, customer imports, quotes, payments, field work, billing, and account access.", path: '/help' })

export default function HelpPage() {
  return <main id="marketing-content" tabIndex={-1} className={styles.page}>
    <div className="shell">
      <header className={styles.hero}>
        <div><p className="eyebrow">FieldClose Help Center</p><h1 className={styles.title}>A clear next step.</h1><p className={styles.intro}>From your first customer to the final invoice. Find the steps, check the details, and keep work moving.</p></div>
        <Link href="/help/getting-started" className={styles.startGuide}><span>New to FieldClose?</span><strong>Start with the setup guide <ArrowUpRight size={22} aria-hidden="true" /></strong></Link>
      </header>
      <HelpSearch />
      <aside className={styles.support} aria-labelledby="help-support-title">
        <div><p className="eyebrow">Need a hand?</p><h2 id="help-support-title">Tell us where you got stuck.</h2><p>Include your business name, the screen you were using, and the error you saw. Leave passwords and private links out of your message.</p></div>
        <div className={styles.supportLinks}><a href={supportMailto('FieldClose support')}>Email support <ArrowUpRight size={19} aria-hidden="true" /></a><Link href="/help/account-and-password#support">What to include</Link></div>
      </aside>
    </div>
  </main>
}

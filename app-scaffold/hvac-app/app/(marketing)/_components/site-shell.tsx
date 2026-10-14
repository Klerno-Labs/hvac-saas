import Link from 'next/link';
import { Wrench, ArrowUpRight } from 'lucide-react';
import { productUrl, signupUrl } from '@/lib/marketing/site';
import { supportMailto } from '@/lib/support';
export function SiteHeader() {
 return <header className="site-header"><div className="shell header-inner">
  <Link className="brand" href="/" aria-label="FieldClose home"><Wrench size={23} aria-hidden="true" />FieldClose<span className="brand-dot">.</span></Link>
  <nav aria-label="Main navigation"><Link href="/demo">Product tour</Link><Link href="/pricing">Pricing</Link><Link href="/resources">Free resources</Link><Link href="/help">Help</Link></nav>
  <div className="header-actions"><a className="login-link" href={`${productUrl}/login`}>Log in</a><a className="button small" href={signupUrl}>Start free trial <ArrowUpRight size={16} aria-hidden="true" /></a></div>
 </div></header>;
}
export function SiteFooter() {
 return <footer className="site-footer"><div className="shell"><div className="footer-top"><div><Link href="/" className="brand">FieldClose<span className="brand-dot">.</span></Link><p>From the first call to the final payment.</p></div><nav aria-label="Footer navigation"><Link href="/demo">Product tour</Link><Link href="/pricing">Pricing</Link><Link href="/hvac-estimating-software">HVAC estimating</Link><Link href="/hvac-invoicing-software">HVAC invoicing</Link><Link href="/resources">Free templates & tools</Link><Link href="/help">Help Center</Link><Link href="/tools/paperwork-calculator">Time calculator</Link><Link href="/faq">FAQ</Link><a href={supportMailto()}>Email support</a><a href={`${productUrl}/privacy`}>Privacy</a><a href={`${productUrl}/terms`}>Terms</a></nav></div><p className="copyright">© {new Date().getFullYear()} Pegrio LLC. FieldClose is a Pegrio LLC product.</p></div></footer>;
}

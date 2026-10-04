import type { Metadata } from "next";
import Link from "next/link";
import { siteUrl } from "@/lib/marketing/site";
import JobPricingCalculator from "./calculator";
import styles from "./calculator.module.css";

const title = "Free HVAC Job Pricing Calculator: Margin & Markup";
const description = "Calculate an HVAC job price from materials, labor, overhead and your gross margin target. Compare margin vs. markup and see break-even costs. No signup required.";
const canonical = `${siteUrl}/tools/hvac-job-pricing-calculator`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: { title, description, url: canonical, type: "website", images: [{ url: "/social-image", width: 1200, height: 630, alt: "FieldClose — Free HVAC job pricing calculator" }] },
  twitter: { card: "summary_large_image", title, description, images: ["/social-image"] },
};

export default function JobPricingCalculatorPage() {
  return (
    <main id="marketing-content" tabIndex={-1} className={`shell ${styles.page}`}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/resources">Resources</Link><span aria-hidden="true">/</span><span>HVAC job pricing calculator</span></nav>
      <header className={`page-heading ${styles.heading}`}>
        <p className="eyebrow">Free tool · No signup required</p>
        <h1>HVAC job pricing calculator</h1>
        <p>Know what the job costs before you quote it. Turn materials, labor and your margin target into a price, then check whether it covers your overhead.</p>
      </header>
      <JobPricingCalculator />
      <section className={styles.explanation} aria-labelledby="calculation-heading">
        <div><p className="eyebrow">The math, made visible</p><h2 id="calculation-heading">How to calculate an HVAC job price</h2></div>
        <div>
          <ol>
            <li><strong>Add direct job costs.</strong> Materials and equipment + (total technician hours × your labor cost per hour). Include employer payroll costs and benefits in labor cost; a customer billing rate belongs in the selling price.</li>
            <li><strong>Apply your gross margin target.</strong> Divide direct cost by (1 − target margin ÷ 100). A job with $400 in direct costs needs a $666.67 price to reach a 40% gross margin, after rounding up to the next cent.</li>
            <li><strong>Check overhead coverage.</strong> Add your allocated overhead to direct cost for a break-even floor. The calculator suggests the higher of this floor and your target-margin price.</li>
            <li><strong>Review what is missing.</strong> Account for permits, disposal, travel, subcontractors, warranty exposure and other costs that apply to your work. Add each cost once. Taxes and percentage-based processing fees require a separate calculation.</li>
          </ol>
          <p>Materials, labor totals and overhead are rounded to the nearest cent. The target-margin selling price rounds up to the next cent. A gross margin target cannot reach 100% when direct costs are greater than zero.</p>
        </div>
      </section>
      <section className={styles.education} aria-labelledby="margin-heading">
        <div><h2 id="margin-heading">Margin and markup are different.</h2><p>Both start with the same gross profit: selling price minus direct job cost. What changes is the number you divide by.</p></div>
        <div className={styles.formulaGrid}>
          <article><h3>Gross margin</h3><p className={styles.formula}>(Price − direct cost) ÷ price × 100</p><p>A $400 job sold for $666.67 has about a 40% gross margin, before allocated overhead.</p></article>
          <article><h3>Markup</h3><p className={styles.formula}>(Price − direct cost) ÷ direct cost × 100</p><p>That same job has about a 66.7% markup. Adding a 40% markup to $400 gives a $560 price and only a 28.6% margin.</p></article>
        </div>
      </section>
      <section className={styles.questions} aria-labelledby="questions-heading">
        <h2 id="questions-heading">Before you use the result</h2>
        <div><h3>What gross margin should an HVAC company target?</h3><p>There is no single target built into this tool. Choose one using your actual overhead, job mix, demand and operating goals, then compare estimates with completed-job costs. The example values are assumptions, not a recommendation or an industry average.</p></div>
        <div><h3>Is overhead included in gross margin?</h3><p>This calculator treats materials and burdened technician labor as direct costs. It shows gross margin before the overhead allocation, then shows the amount left after that allocation separately. Your accounting categories may differ; use them consistently.</p></div>
        <div><h3>Can I use this for a flat-rate repair or an installation?</h3><p>Yes. Enter costs for the complete job. For an installation, add every technician’s hours and all equipment costs. For a repair, include diagnosis and travel in your cost assumptions where appropriate. The result is a planning price, not a binding quote.</p></div>
        <div><h3>Does FieldClose save the numbers I enter here?</h3><p>No. This calculator runs in your browser and does not send the entered costs to FieldClose. Reloading the page restores the example. You do not need to create an account or provide an email address.</p></div>
      </section>
      <section className={styles.cta}>
        <div><h2>Turn the price into a clear estimate.</h2><p>Explore how FieldClose keeps the customer, estimate, job and invoice together.</p><Link className={styles.textLink} href="/resources">Browse free HVAC resources →</Link></div>
        <div><Link className="button" href="/demo">Explore the product demo</Link><Link className="button secondary" href="/pricing">See FieldClose pricing</Link></div>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebApplication", "@id": `${canonical}#calculator`, name: "HVAC Job Pricing Calculator", url: canonical, description, applicationCategory: "BusinessApplication", operatingSystem: "Any", browserRequirements: "Requires JavaScript", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, provider: { "@type": "Organization", name: "FieldClose", url: siteUrl } },
          { "@type": "BreadcrumbList", itemListElement: [
            { "@type": "ListItem", position: 1, name: "Resources", item: `${siteUrl}/resources` },
            { "@type": "ListItem", position: 2, name: "HVAC job pricing calculator", item: canonical },
          ] },
        ],
      }).replace(/</g, "\\u003c") }} />
    </main>
  );
}

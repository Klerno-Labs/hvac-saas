import { marketingMetadata } from '@/lib/marketing/seo'
import { PlanCards } from "@/app/(marketing)/_components/plan-cards";
import { FaqAccordion } from "../_components/faq-accordion";
import { pricingFaqs, siteUrl, plans } from "@/lib/marketing/site";
import { PlanChooser } from "../_components/plan-chooser";
import { serviceTrade } from "@/lib/marketing/trades";
export const metadata = marketingMetadata({ title: "HVAC Software Pricing — Starter & Pro", description: "Compare FieldClose Starter and Pro. Plans from $49 USD per month, with a 14-day trial.", path: '/pricing' })
export default function PricingPage() {
  return (
    <main id="marketing-content" tabIndex={-1}>
      <section className="section shell">
        <div className="page-heading">
          <p className="eyebrow">Straightforward subscriptions</p>
          <h1>
            Find the right fit
            <br />
            for your shop.
          </h1>
          <p>
            Start with a 14-day trial. No credit card required to get started.
          </p>
        </div>
        <h2 className="sr-only">Compare plans</h2>
        <PlanCards />
        <p className="pricing-disclosure">
          Prices shown in USD per month. Payment processing and any applicable
          platform fees are separate. Review the final price and terms in the
          app before subscribing.
        </p>
        <PlanChooser
          prices={{ starter: plans[0].price, pro: plans[1].price }}
          trade={serviceTrade.id}
        />
        <div className="faq-section">
          <h2>Before you get started</h2>
          <FaqAccordion faqs={pricingFaqs} />
        </div>
      </section>
    </main>
  );
}

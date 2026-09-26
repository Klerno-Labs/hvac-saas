import {serviceTrade} from './trades';
import {PLANS, type PlanId} from '@/lib/billing';
/** Public destinations only. Never import server secrets into UI components. */
export const siteUrl = new URL(process.env.APP_URL || 'https://fieldclose.app').origin;
export const productUrl = '';
export function signupPath(plan?: PlanId) {
 const query = new URLSearchParams({trade: serviceTrade.id});
 if (plan) query.set('plan', plan);
 return `/signup?${query.toString()}`;
}
export const signupUrl = signupPath();
export const planSignupUrl = (plan: PlanId) => signupPath(plan);
export const supportEmail = 'support@fieldclose.app';
// Verified against hvac-saas lib/billing.ts. Checkout is authoritative.
export const plans = [
  { key: 'starter', name: 'Starter', price: PLANS.starter.priceMonthly / 100, audience: 'For independent techs and small shops.', features: ['Customer and job management', 'Estimates and invoices', 'Online payment collection', 'Customer portal', 'AI-assisted estimate drafts'] },
  { key: 'pro', name: 'Pro', price: PLANS.pro.priceMonthly / 100, audience: 'For teams sharing the workload.', features: ['Everything in Starter', 'Team members and roles', 'Collections automation', 'Priority support'] },
] as const;
export const pricingFaqs = [
  { q: 'How does the trial work?', a: 'New accounts start with a 14-day trial. No credit card is required at signup. Choose a paid subscription in the app to continue after your trial.' },
  { q: 'Are payment processing fees included?', a: 'The subscription and customer payment processing are separate. Stripe processing charges and any platform fee configured for your account apply to payments. Review your account terms before collecting payment.' },
  { q: 'Can I cancel my subscription?', a: 'Manage your subscription from Settings in the app. Check the service terms for cancellation, retention, and refund details, and export the records you need before closing your account.' },
  { q: 'Can you help me choose a plan?', a: 'Email support@fieldclose.app with your team size and the workflow you need. Confirm your plan, included features, and final subscription total before checkout.' },
];

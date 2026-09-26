import { Check, ArrowRight } from 'lucide-react';
import { plans, planSignupUrl } from '@/lib/marketing/site';
export function PlanCards() {
 return <div className="plan-grid">{plans.map(plan => <article className={`plan-card ${plan.key === 'pro' ? 'plan-pro' : ''}`} key={plan.key}>
 <p className="eyebrow">{plan.key === 'pro' ? 'Built for your team' : 'Keep the essentials together'}</p><h3>{plan.name}</h3><p className="muted">{plan.audience}</p><p className="plan-price">${plan.price}<span> / month</span></p><p className="plan-note">USD · subscription price · processing fees separate</p><a className="button" href={planSignupUrl(plan.key)}>Start free trial<ArrowRight size={17} aria-hidden="true" /></a><ul>{plan.features.map(f=><li key={f}><Check size={18} aria-hidden="true" />{f}</li>)}</ul></article>)}</div>;
}

import { pathToFileURL } from 'node:url';
import { getDefaultResultOrder } from 'node:dns';
import { getDefaultAutoSelectFamily } from 'node:net';

/** Presence/boundary guard only; provider and database readiness are separate. */
export function validateProductionEnvironment(env) {
  const errors = [];
  if (env.DEPLOYMENT_ENV !== 'production') errors.push('production boundary');
  for (const key of ['APP_URL', 'AUTH_URL']) {
    if (env[key] !== 'https://fieldclose.app') errors.push(key);
  }
  for (const key of ['NEXTAUTH_URL', 'NEXT_PUBLIC_APP_URL']) {
    if (env[key] && env[key] !== 'https://fieldclose.app') errors.push(key);
  }
  if (!['true', 'false'].includes(env.SCHEDULED_TASKS_ENABLED)) errors.push('explicit scheduler state');
  // Validate strength without trimming/changing the existing signing key.
  const authSecret = env.AUTH_SECRET || '';
  if (authSecret.replace(/\s/g, '').length < 32 || authSecret.includes('replace-me')) errors.push('authentication secret');
  if (env.AUTH_TRUST_HOST !== 'true') errors.push('trusted reverse proxy');
  if (!/^(?:sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || '')) errors.push('live Stripe key');
  if (!/^pk_live_/.test(env.STRIPE_PUBLISHABLE_KEY || '')) errors.push('live Stripe publishable key');
  for (const key of ['STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET']) {
    if (!/^whsec_/.test(env[key] || '')) errors.push(key);
  }
  if (env.STRIPE_WEBHOOK_SECRET === env.STRIPE_CONNECT_WEBHOOK_SECRET) errors.push('distinct webhook secrets');
  for (const key of ['STRIPE_STARTER_PRICE_ID', 'STRIPE_PRO_PRICE_ID']) {
    if (!/^price_/.test(env[key] || '')) errors.push(key);
  }
  for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'RESEND_API_KEY', 'EMAIL_FROM']) {
    if (!env[key]?.trim()) errors.push(key);
  }
  if (!(env.CRON_SECRET?.length >= 32 || env.COLLECTIONS_CRON_SECRET?.length >= 32)) errors.push('scheduler secret');
  if (/network-guard/.test(env.NODE_OPTIONS || '')) errors.push('synthetic provider guard is forbidden in production');
  try {
    const url = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['.supabase.com', '.supabase.co'].some(suffix => url.hostname.endsWith(suffix)) || !['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode'))) errors.push('encrypted Supabase database URL');
  } catch { errors.push('database connection'); }
  return [...new Set(errors)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateProductionEnvironment(process.env);
  if (getDefaultResultOrder() !== 'ipv4first' || getDefaultAutoSelectFamily()) errors.push('IPv4 provider egress configuration');
  if (errors.length) {
    console.error(`Production environment check failed: ${errors.join(', ')}. Values omitted.`);
    process.exitCode = 1;
  } else console.log('Production environment boundary check passed; provider readiness is a separate check.');
}

import { z } from 'zod'

/** Read-only provider inspection. These checks never certify actual delivery. */
export type ProviderCheck = {
  id: string
  status: 'passed' | 'blocked' | 'unverified'
  detail: string
}

export const STRIPE_PAYLOAD_VERSION = '2025-02-24.acacia'
const BILLING_EVENTS = [
  'customer.subscription.created', 'customer.subscription.updated',
  'customer.subscription.deleted', 'invoice.payment_failed', 'invoice.payment_succeeded',
]
const CONNECT_EVENTS = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.expired', 'payment_intent.payment_failed',
  'payment_intent.succeeded', 'account.updated',
]

type StripePrice = {
  active?: boolean; livemode?: boolean; currency?: string; unit_amount?: number | null
  type?: string; billing_scheme?: string; transform_quantity?: unknown
  recurring?: { interval?: string; interval_count?: number; usage_type?: string } | null
  product?: string | { active?: boolean; deleted?: boolean } | null
}

export function priceMatchesPlan(price: StripePrice, amount: number): boolean {
  return price.active === true && price.livemode === true && price.currency === 'usd'
    && price.unit_amount === amount && price.type === 'recurring'
    && price.billing_scheme === 'per_unit' && price.transform_quantity == null
    && price.recurring?.interval === 'month' && price.recurring.interval_count === 1
    && price.recurring.usage_type === 'licensed'
    && typeof price.product === 'object' && price.product !== null
    && price.product.active === true && price.product.deleted !== true
}

export function verifiedSenderDomain(sender: string | undefined): string | null {
  const input = sender?.trim() ?? ''
  if (!input || /[\r\n]/.test(input)) return null
  const address = input.includes('<') ? input.match(/^[^<>]*<([^<>]+)>$/)?.[1] : input
  const domain = address?.match(/^[^\s@<>]+@([a-z0-9.-]+\.[a-z]{2,})$/i)?.[1].toLowerCase()
  if (!domain || domain === 'resend.dev' || domain.endsWith('.resend.dev')) return null
  return domain
}

export function secureAppOrigin(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' && !url.username && !url.password
      && url.pathname === '/' && !url.search && !url.hash ? url.origin : null
  } catch { return null }
}

type Endpoint = {
  id?: string; url?: string; status?: string; livemode?: boolean
  api_version?: string | null; enabled_events?: string[]
}

// Validate only consumed fields and permit additional provider fields. Unknown
// shapes remain unverified; they must not produce misleading readiness results.
const accountSchema = z.object({
  id: z.string(), charges_enabled: z.boolean(), payouts_enabled: z.boolean(), details_submitted: z.boolean(),
}).passthrough()
const priceSchema = z.object({
  active: z.boolean(), livemode: z.boolean(), currency: z.string(), unit_amount: z.number().int().nullable(),
  type: z.string(), billing_scheme: z.string(), transform_quantity: z.unknown().optional(),
  recurring: z.object({ interval: z.string(), interval_count: z.number().int(), usage_type: z.string() }).passthrough().nullable(),
  product: z.union([z.string(), z.object({ active: z.boolean().optional(), deleted: z.boolean().optional() }).passthrough()
    .refine(product => typeof product.active === 'boolean' || product.deleted === true)]).nullable(),
}).passthrough()
const endpointSchema = z.object({
  id: z.string().min(1), url: z.string(), status: z.string(), livemode: z.boolean(),
  api_version: z.string().nullable(), enabled_events: z.array(z.string()),
}).passthrough()
const endpointsSchema = z.object({ data: z.array(endpointSchema), has_more: z.boolean() }).passthrough()
const featureSchema = z.object({ enabled: z.boolean() }).passthrough()
const portalSchema = z.object({
  active: z.boolean(), livemode: z.boolean(), default_return_url: z.string().nullable(),
  features: z.object({ payment_method_update: featureSchema, subscription_cancel: featureSchema, subscription_update: featureSchema }).passthrough(),
}).passthrough()
const domainListSchema = z.object({
  data: z.array(z.object({ id: z.string().min(1), name: z.string() }).passthrough()), has_more: z.boolean(),
}).passthrough()
const domainSchema = z.object({
  name: z.string(), status: z.string(), capabilities: z.object({ sending: z.string() }).passthrough(),
}).passthrough()

/** The webhook list API does not prove the signing secret or account scope.
 * Return candidates only; scope must be checked in Stripe and through delivery. */
export function inspectWebhookCandidates(endpoints: Endpoint[], origin: string): ProviderCheck[] {
  const eligible = endpoints.filter(endpoint => endpoint.status === 'enabled'
    && endpoint.livemode === true && endpoint.api_version === STRIPE_PAYLOAD_VERSION)
  const includes = (endpoint: Endpoint, required: string[]) => required.every(event =>
    endpoint.enabled_events?.includes(event) || endpoint.enabled_events?.includes('*'))
  const platform = eligible.filter(endpoint =>
    [origin + '/api/billing/webhook', origin + '/api/stripe/webhook'].includes(endpoint.url ?? '')
    && includes(endpoint, BILLING_EVENTS))
  const connect = eligible.filter(endpoint => endpoint.url === origin + '/api/stripe/webhook'
    && includes(endpoint, CONNECT_EVENTS))
  const distinct = platform.some(p => connect.some(c => p.id && c.id && p.id !== c.id))
  return [{
    id: 'stripe.webhook_candidates', status: distinct ? 'passed' : 'blocked',
    detail: distinct
      ? 'Separate live destinations have matching URLs, event selections and payload version.'
      : 'Two distinct live destinations with the required URLs, events and payload version were not found.',
  }, {
    id: 'stripe.webhook_delivery', status: 'unverified',
    detail: 'Verify platform versus connected-account scope, distinct installed signing secrets, and signed deliveries that commit the expected database changes.',
  }]
}

type ProviderEnvironment = Readonly<Record<string, string | undefined>>
type InspectionOptions = {
  env: ProviderEnvironment
  request?: typeof fetch
  checkBucket: (env: ProviderEnvironment) => Promise<void>
}

export async function inspectProviders({ env, request = fetch, checkBucket }: InspectionOptions): Promise<ProviderCheck[]> {
  const checks: ProviderCheck[] = []
  const add = (id: string, status: ProviderCheck['status'], detail: string) => checks.push({ id, status, detail })
  const get = async (url: string, key: string, stripe = false) => {
    const response = await request(url, { method: 'GET', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${key}`, ...(stripe ? { 'Stripe-Version': STRIPE_PAYLOAD_VERSION } : {}) } })
    if (!response.ok) throw new Error('Provider request was not successful')
    return response.json()
  }
  const origin = secureAppOrigin(env.APP_URL)
  add('app.origin', origin ? 'passed' : 'blocked', origin ? 'A canonical HTTPS app origin is configured.' : 'APP_URL must be a canonical HTTPS origin without credentials, paths or query parameters.')
  const stripeKey = env.STRIPE_SECRET_KEY?.trim()
  const platformSecret = env.STRIPE_WEBHOOK_SECRET?.trim()
  const connectSecret = env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim()
  const secretShape = (value: string | undefined) => Boolean(value && /^whsec_[A-Za-z0-9]+$/.test(value))
  const validSecrets = secretShape(platformSecret) && secretShape(connectSecret) && platformSecret !== connectSecret
  add('stripe.webhook_secrets', validSecrets ? 'passed' : 'blocked', validSecrets
    ? 'Distinct signing-secret values are installed. Their match to the correct destinations still requires signed-delivery verification.'
    : 'Install distinct platform and Connect webhook signing secrets with valid whsec_ format; values are never printed.')
  if (!stripeKey?.match(/^(sk|rk)_live_/)) {
    add('stripe.mode', 'blocked', 'A live Stripe secret key is required; the configured key is missing or not live. No Stripe requests were made.')
  } else {
    add('stripe.mode', 'passed', 'Configured Stripe key has live mode.')
    try {
      const account = accountSchema.parse(await get('https://api.stripe.com/v1/account', stripeKey, true))
      add('stripe.account', account.charges_enabled === true && account.payouts_enabled === true && account.details_submitted === true ? 'passed' : 'blocked',
        'Live account must have payments, payouts and submitted business details enabled.')
    } catch { add('stripe.account', 'unverified', 'Account read failed. Check key permissions and connectivity; provider error details are intentionally omitted.') }
    for (const [plan, amount] of [['STARTER', 4900], ['PRO', 9900]] as const) {
      const priceId = env[`STRIPE_${plan}_PRICE_ID`]?.trim()
      if (!priceId?.match(/^price_[a-zA-Z0-9]+$/)) { add(`stripe.price.${plan.toLowerCase()}`, 'blocked', 'A valid price ID is required.'); continue }
      try {
        const price = priceSchema.parse(await get(`https://api.stripe.com/v1/prices/${priceId}?expand%5B%5D=product`, stripeKey, true))
        add(`stripe.price.${plan.toLowerCase()}`, priceMatchesPlan(price, amount) ? 'passed' : 'blocked',
          `Expected an active live USD ${amount / 100}/month fixed licensed price, no quantity transformation, and an active product.`)
      } catch { add(`stripe.price.${plan.toLowerCase()}`, 'unverified', 'Price read failed. Verify the price belongs to this account and the key can read it.') }
    }
    if (origin) {
      try {
        const endpoints: Endpoint[] = []
        let after = ''
        let complete = false
        for (let page = 0; page < 10; page++) {
          const response = endpointsSchema.parse(await get('https://api.stripe.com/v1/webhook_endpoints?limit=100' + (after ? '&starting_after=' + encodeURIComponent(after) : ''), stripeKey, true))
          endpoints.push(...response.data)
          if (!response.has_more) { complete = true; break }
          after = response.data.at(-1)?.id ?? ''
          if (!after) break
        }
        checks.push(...inspectWebhookCandidates(endpoints, origin))
        if (!complete) add('stripe.webhook_inventory', 'unverified', 'Webhook inventory exceeded the bounded read. Review remaining destinations in Stripe.')
      } catch { add('stripe.webhook_candidates', 'unverified', 'Webhook inventory could not be read with this key.') }
    }
    const portalId = env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID?.trim()
    if (!portalId?.match(/^bpc_[a-zA-Z0-9]+$/)) add('stripe.portal', 'blocked', 'Configure a dedicated FieldClose billing portal configuration ID.')
    else {
      try {
        const portal = portalSchema.parse(await get(`https://api.stripe.com/v1/billing_portal/configurations/${portalId}`, stripeKey, true))
        let returnOrigin: string | null = null
        try { returnOrigin = new URL(portal.default_return_url ?? '').origin } catch { /* Missing URL fails verification. */ }
        add('stripe.portal', portal.active === true && portal.livemode === true && origin !== null && returnOrigin === origin
          && portal.features.payment_method_update.enabled === true && portal.features.subscription_cancel.enabled === true
          && portal.features.subscription_update.enabled === false ? 'passed' : 'blocked',
          'Dedicated live portal must be active, return to FieldClose, and allow payment-method updates and cancellation. Price changes must remain disabled until entitlement reconciliation supports them. Review branding and legal links separately.')
      } catch { add('stripe.portal', 'unverified', 'Billing portal configuration could not be read.') }
    }
  }

  const domain = verifiedSenderDomain(env.EMAIL_FROM)
  if (!domain || !env.RESEND_API_KEY?.trim()) add('email.sender', 'blocked', 'Configure a business sender and Resend key; resend.dev is a test-only sender.')
  else {
    try {
      let matched: { id: string; name: string } | undefined
      let after = ''
      let complete = false
      for (let page = 0; page < 10; page++) {
        const result = domainListSchema.parse(await get('https://api.resend.com/domains?limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''), env.RESEND_API_KEY.trim()))
        matched = result.data.find(item => item.name.toLowerCase() === domain)
        if (matched || !result.has_more) { complete = true; break }
        after = result.data.at(-1)?.id ?? ''
        if (!after) break
      }
      if (!matched) add('email.sender', complete ? 'blocked' : 'unverified', 'The exact sender domain was not found among the accessible domains.')
      else {
        const detail = domainSchema.parse(await get('https://api.resend.com/domains/' + encodeURIComponent(matched.id), env.RESEND_API_KEY.trim()))
        add('email.sender', detail.name.toLowerCase() === domain && detail.status === 'verified' && detail.capabilities.sending === 'enabled' ? 'passed' : 'blocked',
          'Sender domain must be verified with sending enabled. No email was sent.')
      }
    } catch { add('email.sender', 'unverified', 'Domain read failed. A sending-only key cannot verify domains; use provider evidence without broadening app permissions.') }
  }
  const storageVars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const
  if (storageVars.some(key => !env[key]?.trim())) add('storage.bucket', 'blocked', 'Private R2 storage credentials or bucket configuration are missing.')
  else {
    try {
      await checkBucket(env)
      add('storage.bucket', 'passed', 'Configured bucket is reachable using HeadBucket. This does not prove object write/read permissions or private access controls.')
    } catch { add('storage.bucket', 'unverified', 'Bucket metadata read failed. Check scoped credentials, bucket name, account and connectivity.') }
  }
  add('end_to_end', 'unverified', 'Still required: recovered database and backup/restore proof, signed live payment and billing lifecycle, authorized email delivery, private photo upload/read/access denial, and operational alert receipt. This report sends no messages, payments, uploads or customer data.')
  return checks
}

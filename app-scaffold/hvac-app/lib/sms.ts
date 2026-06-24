import Twilio, { validateRequest } from 'twilio'
import type { CollectionStage } from '@/lib/validations/collections'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'

let _client: Twilio.Twilio | null = null

function getTwilioClient(): Twilio.Twilio | null {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  if (!_client) {
    _client = Twilio(sid, token)
  }
  return _client
}

function getFromNumber(): string | null {
  return process.env.TWILIO_PHONE_NUMBER || null
}

export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  )
}

export type SmsResult = { success: true; sid: string } | { success: false; error: string }

/**
 * Raw transport. Sends via Twilio if configured, otherwise logs and returns a
 * not-configured result. Does NOT touch the org gate, opt-out state, or the
 * thread table — use {@link sendCustomerSms} for any customer-facing message.
 * Used directly only for carrier-required compliance replies (HELP, opt-out
 * confirmations) which must be honoured regardless of campaign registration.
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const client = getTwilioClient()
  const from = getFromNumber()

  if (!client || !from) {
    console.log(`[sms-skipped] Twilio not configured — would send to ${to}: ${body}`)
    return { success: false, error: 'SMS delivery not configured (Twilio env vars missing)' }
  }

  try {
    const message = await client.messages.create({
      to,
      from,
      body,
    })

    return { success: true, sid: message.sid }
  } catch (error) {
    console.error('[sms-error]', error)
    return { success: false, error: 'Failed to send SMS' }
  }
}

// ---------------------------------------------------------------------------
// Phone normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a phone number to E.164 (+1... for the NANP default). Returns null
 * for inputs without enough digits. Customer phones are stored free-form
 * ("555-555-5555", "(555) 555-5555"), so inbound threading must normalize both
 * sides before comparing. NANP-centric (US/CA): assumes a leading country code
 * of 1 when 11 digits are present.
 */
export function normalizePhoneE164(input: string | null | undefined): string | null {
  if (!input) return null
  const digits = input.replace(/\D+/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length > 6) return `+${digits}`
  return null
}

/** Last-10-digits key used for fuzzy matching against free-form stored phones. */
export function phoneMatchKey(input: string | null | undefined): string | null {
  if (!input) return null
  const digits = input.replace(/\D+/g, '')
  if (digits.length < 10) return null
  return digits.slice(-10)
}

// ---------------------------------------------------------------------------
// Opt-out state
// ---------------------------------------------------------------------------

/**
 * Is this (org, phone) currently opted out of SMS? A lifted opt-out
 * (liftedAt set) does not block sending. Used by the guarded sender and by
 * inbound START processing.
 */
export async function isOptedOut(organizationId: string, phoneE164: string): Promise<boolean> {
  const row = await db.smsOptOut.findUnique({
    where: { organizationId_phone: { organizationId, phone: phoneE164 } },
    select: { liftedAt: true },
  })
  return !!row && !row.liftedAt
}

/** Carrier-required opt-out confirmation; bypasses the campaign gate on purpose. */
export const OPT_OUT_CONFIRMATION =
  'You have been unsubscribed and will no longer receive SMS messages from this number. Reply START to resubscribe.'

export const OPT_IN_CONFIRMATION =
  'You have been resubscribed. Reply STOP anytime to opt out.'

export const HELP_REPLY =
  'Reply STOP to unsubscribe, START to resubscribe. Msg & data rates may apply.'

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const SMS_TEMPLATES = [
  'appointment_confirmation',
  'appointment_reminder',
  'on_my_way',
] as const
export type SmsTemplateSlug = (typeof SMS_TEMPLATES)[number]

export type TemplateContext = {
  orgName: string
  customerName: string
  jobTitle?: string
  /** ISO string or Date */
  scheduledFor?: string | Date
  technicianName?: string
  /** "On my way" ETA in minutes */
  etaMinutes?: number
}

function formatWhen(scheduledFor?: string | Date): string {
  if (!scheduledFor) return 'your appointment'
  try {
    return new Date(scheduledFor).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return 'your appointment'
  }
}

/**
 * Render a customer-facing SMS template to its body string. Pure function —
 * safe to unit-test without any DB or network. Bodies are kept short; segment
 * splitting is Twilio's responsibility.
 */
export function renderSmsTemplate(slug: SmsTemplateSlug, ctx: TemplateContext): string {
  switch (slug) {
    case 'appointment_confirmation':
      return `Hi ${ctx.customerName}, ${ctx.orgName} has scheduled${ctx.jobTitle ? ` (${ctx.jobTitle})` : ''} for ${formatWhen(ctx.scheduledFor)}. Reply STOP to opt out.`
    case 'appointment_reminder':
      return `Reminder from ${ctx.orgName}: appointment${ctx.jobTitle ? ` (${ctx.jobTitle})` : ''} on ${formatWhen(ctx.scheduledFor)}. Reply STOP to opt out.`
    case 'on_my_way': {
      const tech = ctx.technicianName ? `${ctx.technicianName} from ` : ''
      const eta = ctx.etaMinutes ? ` in ~${ctx.etaMinutes} min` : ''
      return `${tech}${ctx.orgName} is on the way${eta}. Reply STOP to opt out.`
    }
    default: {
      // Exhaustiveness guard
      const _exhaustive: never = slug
      return _exhaustive
    }
  }
}

// ---------------------------------------------------------------------------
// Guarded, org-aware sending (threaded + gated)
// ---------------------------------------------------------------------------

export type SendCustomerSmsInput = {
  organizationId: string
  /** Customer id the message belongs to (threads onto the customer). */
  customerId?: string
  /** Optional job to thread onto. */
  jobId?: string
  to: string
  body: string
  /** Template slug if the body came from a template. */
  templateSlug?: SmsTemplateSlug
}

export type SendCustomerSmsResult =
  | { ok: true; sid: string }
  | { ok: false; reason: 'not_configured' | 'not_registered' | 'opted_out' | 'send_failed'; error: string }

/**
 * Canonical customer-facing send path. Enforces, in order:
 *   1. Twilio is configured
 *   2. The org has A2P 10DLC registered (legal gate)
 *   3. The recipient has not opted out (compliance)
 * Then sends and persists an outbound row on the SmsMessage thread.
 *
 * NOTE: 10DLC registration is per Twilio brand/campaign in the real world; the
 * org flag here is the operator-controlled gate that says "this tenant may now
 * send A2P traffic". Sending is blocked until BOTH this and the org's
 * `smsEnabled` intent are true.
 */
export async function sendCustomerSms(input: SendCustomerSmsInput): Promise<SendCustomerSmsResult> {
  if (!isTwilioConfigured()) {
    console.log(`[sms-skipped] Twilio not configured for org ${input.organizationId}`)
    return { ok: false, reason: 'not_configured', error: 'SMS delivery not configured' }
  }

  const toE164 = normalizePhoneE164(input.to)
  if (!toE164) {
    return { ok: false, reason: 'send_failed', error: 'Invalid recipient phone number' }
  }

  const org = await db.organization.findUnique({
    where: { id: input.organizationId },
    select: { smsEnabled: true, tenDlcRegistered: true },
  })
  if (!org) {
    return { ok: false, reason: 'not_registered', error: 'Organization not found' }
  }
  if (!org.smsEnabled || !org.tenDlcRegistered) {
    return {
      ok: false,
      reason: 'not_registered',
      error: 'SMS sending is disabled until A2P 10DLC registration is complete',
    }
  }

  if (await isOptedOut(input.organizationId, toE164)) {
    return { ok: false, reason: 'opted_out', error: 'Recipient has opted out of SMS' }
  }

  const result = await sendSms(toE164, input.body)
  if (!result.success) {
    return { ok: false, reason: 'send_failed', error: result.error }
  }

  await db.smsMessage.create({
    data: {
      organizationId: input.organizationId,
      customerId: input.customerId ?? null,
      jobId: input.jobId ?? null,
      direction: 'outbound',
      fromNumber: getFromNumber()!,
      toNumber: toE164,
      body: input.body,
      status: 'queued',
      providerMessageSid: result.sid,
      templateSlug: input.templateSlug ?? null,
    },
  })

  await trackEvent({
    organizationId: input.organizationId,
    eventName: 'sms_sent',
    entityType: input.customerId ? 'customer' : undefined,
    entityId: input.customerId,
    metadataJson: { template: input.templateSlug ?? null, sid: result.sid },
  })

  return { ok: true, sid: result.sid }
}

/**
 * Send a collection reminder SMS for overdue invoices. Routed through the
 * guarded sender so opt-out and 10DLC registration are honoured (a STOP must
 * stop collections too, or it is not a valid opt-out).
 */
export async function sendCollectionSms(params: {
  organizationId: string
  customerId: string
  to: string
  customerName: string
  invoiceNumber: string
  totalFormatted: string
  orgName: string
  stage: CollectionStage
}): Promise<SendCustomerSmsResult> {
  const stageText = {
    overdue_1: `Hi ${params.customerName}, this is a friendly reminder from ${params.orgName} that invoice #${params.invoiceNumber} for ${params.totalFormatted} is past due. Please arrange payment at your convenience. Reply STOP to opt out.`,
    overdue_2: `Hi ${params.customerName}, second reminder from ${params.orgName}: invoice #${params.invoiceNumber} for ${params.totalFormatted} is still outstanding. Please arrange payment soon. Reply STOP to opt out.`,
    final_notice: `Hi ${params.customerName}, final notice from ${params.orgName}: invoice #${params.invoiceNumber} for ${params.totalFormatted} requires immediate payment to avoid further action. Reply STOP to opt out.`,
  }[params.stage]

  return sendCustomerSms({
    organizationId: params.organizationId,
    customerId: params.customerId,
    to: params.to,
    body: stageText,
  })
}

// ---------------------------------------------------------------------------
// Signature verification (inbound webhook)
// ---------------------------------------------------------------------------

/**
 * Verify a Twilio webhook signature. `url` MUST be the exact URL Twilio called
 * (scheme + host + path + query). Behind a proxy this is reconstructed from
 * APP_URL, not from the (relative) runtime request URL.
 */
export function verifyTwilioSignature(args: {
  authToken: string
  signature: string
  url: string
  params: Record<string, string>
}): boolean {
  try {
    return validateRequest(args.authToken, args.signature, args.url, args.params)
  } catch {
    return false
  }
}

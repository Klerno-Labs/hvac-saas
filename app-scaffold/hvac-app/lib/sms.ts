import Twilio from 'twilio'
import type { CollectionStage } from '@/lib/validations/collections'

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

type SmsResult = { success: true; sid: string } | { success: false; error: string }

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

export async function sendAppointmentReminderSms(params: {
  to: string
  customerName: string
  jobTitle: string
  orgName: string
  scheduledFor: Date
}): Promise<SmsResult> {
  const dateStr = params.scheduledFor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const timeStr = params.scheduledFor.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const body = `Hi ${params.customerName}, reminder from ${params.orgName}: your appointment (${params.jobTitle}) is scheduled for ${dateStr} at ${timeStr}. Reply STOP to opt out.`
  return sendSms(params.to, body)
}

/**
 * Send a collection reminder SMS for overdue invoices.
 */
export async function sendCollectionSms(params: {
  to: string
  customerName: string
  invoiceNumber: string
  totalFormatted: string
  orgName: string
  stage: CollectionStage
}): Promise<SmsResult> {
  const stageText = {
    overdue_1: `Hi ${params.customerName}, this is a friendly reminder from ${params.orgName} that invoice #${params.invoiceNumber} for ${params.totalFormatted} is past due. Please arrange payment at your convenience.`,
    overdue_2: `Hi ${params.customerName}, second reminder from ${params.orgName}: invoice #${params.invoiceNumber} for ${params.totalFormatted} is still outstanding. Please arrange payment soon.`,
    final_notice: `Hi ${params.customerName}, final notice from ${params.orgName}: invoice #${params.invoiceNumber} for ${params.totalFormatted} requires immediate payment to avoid further action.`,
  }[params.stage]

  return sendSms(params.to, stageText)
}

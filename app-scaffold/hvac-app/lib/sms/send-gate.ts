/**
 * Server-only — do not import from client components.
 *
 * Enforces the outbound-SMS send-eligibility rules for a given org.
 * `tenDlcRegistered` reflects external A2P 10DLC regulatory approval and must
 * originate from the org's verified registration state set upstream in the
 * Robert control plane. It must never be defaulted to true, derived from a
 * client request, or toggled in code — it is a regulatory gate, not a feature
 * flag.
 */

export interface OrgSmsConfig {
  orgId: string
  /** Set by Robert only after external A2P 10DLC approval is confirmed. */
  tenDlcRegistered: boolean
  messagingServiceSid?: string
  smsEnabled: boolean
}

export type SendDecision =
  | { allowed: true }
  | {
      allowed: false
      reason:
        | 'not_10dlc_registered'
        | 'sms_disabled'
        | 'recipient_opted_out'
        | 'missing_messaging_service'
    }

/**
 * Determines whether an SMS may be sent for a given org configuration and
 * recipient opt-out state. Evaluated fail-closed: every condition must be
 * satisfied in order; the first failure short-circuits.
 *
 * The `not_10dlc_registered` check is the outermost guard. No combination of
 * other flags can bypass it — flipping it true requires external A2P 10DLC
 * approval and must originate from Robert, never from a client request or a
 * default value.
 */
export function canSendSms(cfg: OrgSmsConfig, recipientOptedOut: boolean): SendDecision {
  if (!cfg.tenDlcRegistered) return { allowed: false, reason: 'not_10dlc_registered' }
  if (!cfg.smsEnabled) return { allowed: false, reason: 'sms_disabled' }
  if (!cfg.messagingServiceSid) return { allowed: false, reason: 'missing_messaging_service' }
  if (recipientOptedOut) return { allowed: false, reason: 'recipient_opted_out' }
  return { allowed: true }
}

/**
 * Returns the deny-by-default SMS config for a newly-provisioned org.
 * Brand-new orgs have no A2P 10DLC registration and SMS is disabled until
 * explicitly enabled after registration is confirmed upstream.
 */
export function defaultOrgSmsConfig(orgId: string): OrgSmsConfig {
  return { orgId, tenDlcRegistered: false, smsEnabled: false }
}

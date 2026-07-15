import "server-only";

export interface OrgSmsConfig {
  orgId: string;
  /**
   * Whether this org has completed external A2P 10DLC registration with the carrier ecosystem.
   *
   * IMPORTANT: This flag MUST only be set to `true` by the upstream Robert control plane after
   * verified A2P 10DLC approval from The Campaign Registry (TCR). It must never be set from a
   * client request, a default value, or a code toggle. Flipping this to `true` without actual
   * carrier registration exposes the org to message filtering, carrier blocking, and regulatory
   * liability under TCPA/CTIA guidelines.
   */
  tenDlcRegistered: boolean;
  messagingServiceSid?: string;
  smsEnabled: boolean;
}

export type SendDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "not_10dlc_registered"
        | "sms_disabled"
        | "recipient_opted_out"
        | "missing_messaging_service";
    };

/**
 * Determines whether an outbound SMS may be sent for the given org and recipient.
 *
 * Evaluated fail-closed in order:
 * 1. A2P 10DLC registration (hard gate — external regulatory requirement, never a code toggle)
 * 2. Org-level SMS enabled flag
 * 3. Messaging Service SID present
 * 4. Recipient opt-out status
 *
 * Every check requires an explicit per-org OrgSmsConfig; there is no ambient or global org,
 * and no cross-org default that could leak one tenant's messaging service into another.
 */
export function canSendSms(
  cfg: OrgSmsConfig,
  recipientOptedOut: boolean
): SendDecision {
  if (!cfg.tenDlcRegistered) {
    return { allowed: false, reason: "not_10dlc_registered" };
  }
  if (!cfg.smsEnabled) {
    return { allowed: false, reason: "sms_disabled" };
  }
  if (!cfg.messagingServiceSid) {
    return { allowed: false, reason: "missing_messaging_service" };
  }
  if (recipientOptedOut) {
    return { allowed: false, reason: "recipient_opted_out" };
  }
  return { allowed: true };
}

/**
 * Returns a deny-by-default SMS config for a brand-new org.
 * SMS remains hard-disabled until the org completes A2P 10DLC registration via Robert.
 */
export function defaultOrgSmsConfig(orgId: string): OrgSmsConfig {
  return {
    orgId,
    tenDlcRegistered: false,
    smsEnabled: false,
  };
}

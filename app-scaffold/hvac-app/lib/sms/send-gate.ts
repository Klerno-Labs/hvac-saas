export interface OrgSmsConfig {
  orgId: string;
  tenDlcRegistered: boolean;
  smsEnabled: boolean;
}

export const defaultOrgSmsConfig: OrgSmsConfig = {
  orgId: "",
  tenDlcRegistered: false,
  smsEnabled: false,
};

export function canSendSms(
  cfg: OrgSmsConfig,
  recipientOptedOut: boolean,
): { allowed: boolean; reason?: string } {
  if (!cfg.tenDlcRegistered) return { allowed: false, reason: "not_10dlc_registered" };
  if (!cfg.smsEnabled) return { allowed: false, reason: "sms_not_enabled" };
  if (recipientOptedOut) return { allowed: false, reason: "recipient_opted_out" };
  return { allowed: true };
}

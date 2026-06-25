import "server-only";
import { emitOutboundSmsIntent } from "@/lib/fieldclose-events";
import type { SmsTemplateId } from "@/lib/fieldclose-events";

export type { SmsTemplateId };

export interface OrgSmsConfig {
  orgId: string;
  smsEnabled: boolean;
  tenDlcRegistered: boolean;
}

export type SmsTemplateVars = Record<string, string>;

export interface SendSmsRequest {
  cfg: OrgSmsConfig;
  to: string;
  templateId: SmsTemplateId;
  vars: SmsTemplateVars;
  recipientOptedOut: boolean;
  idempotencyKey: string;
}

const STOP_FOOTER = "\n\nReply STOP to opt out.";

function canSendSms(
  cfg: OrgSmsConfig,
  recipientOptedOut: boolean,
): { allowed: boolean; reason?: string } {
  if (!cfg.tenDlcRegistered) return { allowed: false, reason: "not_10dlc_registered" };
  if (!cfg.smsEnabled) return { allowed: false, reason: "sms_disabled" };
  if (recipientOptedOut) return { allowed: false, reason: "opted_out" };
  return { allowed: true };
}

function renderTemplate(templateId: SmsTemplateId, vars: SmsTemplateVars): string {
  const base = vars.body ?? `[${templateId}]`;
  return `${base}${STOP_FOOTER}`;
}

export async function sendTemplatedSms(
  req: SendSmsRequest,
): Promise<{ sent: boolean; reason?: string }> {
  const { allowed, reason } = canSendSms(req.cfg, req.recipientOptedOut);
  if (!allowed) {
    return { sent: false, reason };
  }

  const body = renderTemplate(req.templateId, req.vars);
  await emitOutboundSmsIntent({
    orgId: req.cfg.orgId,
    to: req.to,
    templateId: req.templateId,
    body,
    idempotencyKey: req.idempotencyKey,
  });

  return { sent: true };
}

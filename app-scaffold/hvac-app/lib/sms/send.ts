import "server-only";
import { canSendSms, type OrgSmsConfig } from "@/lib/sms/send-gate";
import { renderTemplate, type SmsTemplateId, type SmsTemplateVars } from "@/lib/sms/templates";
import { emitOutboundSmsIntent } from "@/lib/fieldclose-events";

export interface SendSmsRequest {
  cfg: OrgSmsConfig;
  to: string;
  templateId: SmsTemplateId;
  vars: SmsTemplateVars;
  recipientOptedOut: boolean;
  idempotencyKey: string;
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

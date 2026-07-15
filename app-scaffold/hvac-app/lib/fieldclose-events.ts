import "server-only";
import { emitEvent } from "@/lib/robert-client";

export type SmsTemplateId = string;

export async function emitOutboundSmsIntent(input: {
  orgId: string;
  to: string;
  templateId: SmsTemplateId;
  body: string;
  idempotencyKey: string;
}): Promise<void> {
  try {
    const result = await emitEvent({
      eventId: input.idempotencyKey,
      type: "sms.outbound.intent",
      payload: {
        orgId: input.orgId,
        to: input.to,
        templateId: input.templateId,
        body: input.body,
        source: "fieldclose.app",
      },
    });
    if (!result.ok) {
      console.warn(
        "[fieldclose-events] emitOutboundSmsIntent upstream not ok:",
        result.status,
        result.reason,
      );
    }
  } catch (err) {
    console.warn("[fieldclose-events] emitOutboundSmsIntent failed:", err);
  }
}

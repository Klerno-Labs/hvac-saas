import "server-only";
import { emitEvent } from "./robert-client";

export type SmsConsentAction = "STOP" | "START" | "HELP" | "NONE";

export function classifyInboundKeyword(body: string): SmsConsentAction {
  const normalized = body.trim().toUpperCase();
  if (/^STOP$/.test(normalized)) return "STOP";
  if (/^(START|UNSTOP|YES)$/.test(normalized)) return "START";
  if (/^(HELP|INFO)$/.test(normalized)) return "HELP";
  return "NONE";
}

export async function emitInboundSms(input: {
  from: string;
  to: string;
  body: string;
  messageSid: string;
  consentAction: SmsConsentAction;
}): Promise<void> {
  const result = await emitEvent({
    eventId: input.messageSid,
    type: "sms.inbound",
    payload: {
      from: input.from,
      to: input.to,
      body: input.body,
      messageSid: input.messageSid,
      consentAction: input.consentAction,
      source: "fieldclose.app",
    },
  });
  if (!result.ok) {
    console.warn(
      "[fieldclose-events] emitInboundSms upstream not ok:",
      result.status,
      result.reason,
    );
  }
}

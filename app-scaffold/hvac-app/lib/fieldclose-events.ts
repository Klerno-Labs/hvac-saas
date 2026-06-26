import "server-only";
import { emitEvent } from "@/lib/robert-client";

export type SmsConsentAction = "none" | "stop" | "start" | "help";

// TCPA/CTIA opt-out keywords — exact match only (per carrier requirements).
export function classifyInboundKeyword(body: string): SmsConsentAction {
  const normalized = body.trim().toUpperCase();
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(normalized)) return "stop";
  if (["START", "YES", "UNSTOP"].includes(normalized)) return "start";
  if (["HELP", "INFO"].includes(normalized)) return "help";
  return "none";
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
  }).catch((err: unknown) => {
    console.warn("[fieldclose-events] emitInboundSms fetch threw", err);
    return null;
  });

  if (result && !result.ok) {
    console.warn("[fieldclose-events] emitInboundSms upstream failure", result.status, result.reason);
  }
}

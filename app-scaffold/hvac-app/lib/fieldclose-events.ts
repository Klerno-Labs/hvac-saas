import "server-only";

export type SmsConsentAction = "STOP" | "START" | "HELP" | "NONE";

export function classifyInboundKeyword(body: string): SmsConsentAction {
  const normalized = body.trim().toUpperCase();
  if (/^STOP$/.test(normalized)) return "STOP";
  if (/^(START|UNSTOP|YES)$/.test(normalized)) return "START";
  if (/^(HELP|INFO)$/.test(normalized)) return "HELP";
  return "NONE";
}

// Robert ingest forwarding removed 2026-07-21 — Robert is decommissioned
// (robert-client deleted, ROBERT_* unset). Inbound SMS is handled locally by
// the route (consent action); there is no upstream to emit to anymore.
export async function emitInboundSms(input: {
  from: string;
  to: string;
  body: string;
  messageSid: string;
  consentAction: SmsConsentAction;
}): Promise<void> {
  // Intentionally a no-op sink for now: the consent action is applied by the
  // caller; retain this hook so a future event pipeline can slot in without
  // touching the route.
  void input;
}

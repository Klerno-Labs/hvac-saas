import "server-only";

export type SmsConsentAction = "stop" | "start" | "help" | "none";

const STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_KEYWORDS = new Set(["START", "YES", "UNSTOP"]);
const HELP_KEYWORDS = new Set(["HELP", "INFO"]);

function normalizeKeyword(body: string): string {
  return body
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .replace(/^[^\w]+|[^\w]+$/g, "");
}

export function classifyInboundKeyword(body: string): SmsConsentAction {
  const normalized = normalizeKeyword(body);
  if (STOP_KEYWORDS.has(normalized)) return "stop";
  if (START_KEYWORDS.has(normalized)) return "start";
  if (HELP_KEYWORDS.has(normalized)) return "help";
  return "none";
}

export function isOptOutKeyword(body: string): boolean {
  return classifyInboundKeyword(body) === "stop";
}

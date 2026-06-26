import "server-only"

export type SmsConsentAction = "stop" | "start" | "help" | "none"

const STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"])
const START_KEYWORDS = new Set(["START", "YES", "UNSTOP"])
const HELP_KEYWORDS = new Set(["HELP", "INFO"])

// Normalize per CTIA rules: trim, collapse whitespace, uppercase, strip surrounding punctuation
function normalize(body: string): string {
  return body.trim().replace(/\s+/g, " ").toUpperCase().replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "")
}

export function classifyInboundKeyword(body: string): SmsConsentAction {
  const word = normalize(body)
  if (STOP_KEYWORDS.has(word)) return "stop"
  if (START_KEYWORDS.has(word)) return "start"
  if (HELP_KEYWORDS.has(word)) return "help"
  return "none"
}

export function isOptOutKeyword(body: string): boolean {
  return classifyInboundKeyword(body) === "stop"
}

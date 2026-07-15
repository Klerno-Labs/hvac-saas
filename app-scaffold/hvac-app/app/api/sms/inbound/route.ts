export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { verifyTwilioSignature } from "@/lib/sms/twilio-verify";
import { twilioAuthToken } from "@/lib/env";
import { emitInboundSms, classifyInboundKeyword } from "@/lib/fieldclose-events";

const ROUTE_PATH = "/api/sms/inbound";
const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function POST(req: Request): Promise<Response> {
  const formData = await req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  const signatureHeader = req.headers.get("x-twilio-signature");

  // URL must be reconstructed from the trusted env var, never from request headers.
  const publicAppUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const url = `${publicAppUrl}${ROUTE_PATH}`;

  let authToken: string;
  try {
    authToken = twilioAuthToken();
  } catch {
    return new Response("", { status: 403 });
  }

  if (!verifyTwilioSignature({ authToken, signatureHeader, url, params })) {
    return new Response("", { status: 403 });
  }

  const messageSid = params.MessageSid ?? "";
  const from = params.From ?? "";
  const to = params.To ?? "";
  const body = params.Body ?? "";

  void emitInboundSms({
    from,
    to,
    body,
    messageSid,
    consentAction: classifyInboundKeyword(body),
  });

  return new Response(TWIML_EMPTY, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

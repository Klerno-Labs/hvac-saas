import "server-only";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { twilioAuthToken } from "@/lib/env";
import { verifyTwilioSignature } from "@/lib/sms/twilio-verify";
import { classifyInboundKeyword, emitInboundSms } from "@/lib/fieldclose-events";

const ROUTE_PATH = "/api/sms/inbound";
const TWIML_EMPTY =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function POST(req: Request): Promise<Response> {
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const url = `${appUrl}${ROUTE_PATH}`;

  let authToken: string;
  try {
    authToken = twilioAuthToken();
  } catch {
    console.error("[sms/inbound] TWILIO_AUTH_TOKEN not configured");
    return new Response("", { status: 500 });
  }

  const signatureHeader = req.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature({ authToken, signatureHeader, url, params })) {
    return new Response("", { status: 403 });
  }

  const messageSid = params["MessageSid"] ?? "";
  const from = params["From"] ?? "";
  const to = params["To"] ?? "";
  const body = params["Body"] ?? "";

  const consentAction = classifyInboundKeyword(body);
  await emitInboundSms({ from, to, body, messageSid, consentAction });

  return new Response(TWIML_EMPTY, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

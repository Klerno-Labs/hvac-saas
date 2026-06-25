import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sendTemplatedSms } from "@/lib/sms/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const orgSmsConfigSchema = z.object({
  orgId: z.string().min(1).max(256),
  smsEnabled: z.boolean(),
  tenDlcRegistered: z.boolean(),
});

const bodySchema = z.object({
  orgId: z.string().min(1).max(256),
  to: z.string().min(7).max(32),
  templateId: z.string().min(1).max(128),
  vars: z.record(z.string(), z.string()),
  recipientOptedOut: z.boolean(),
  idempotencyKey: z.string().min(1).max(256),
  cfg: orgSmsConfigSchema,
});

function verifySignature(rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const secret = process.env.ROBERT_APP_SECRET ?? process.env.FIELDCLOSE_APP_SECRET;
  if (!secret || !/^[0-9a-f]+$/i.test(secret) || secret.length !== 64) return false;

  const parts: Record<string, string> = {};
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq !== -1) parts[part.slice(0, eq)] = part.slice(eq + 1);
  }
  const ts = parts["t"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const tsNum = parseInt(ts, 10);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 300) return false;

  const expected = createHmac("sha256", Buffer.from(secret, "hex"))
    .update(`${ts}.${rawBody}`)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  if (!verifySignature(rawBody, req.headers.get("X-Robert-Signature"))) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const result = bodySchema.safeParse(parsed);
  if (!result.success) {
    return NextResponse.json(
      { ok: false, reason: "invalid_input", issues: result.error.flatten() },
      { status: 400 },
    );
  }

  const { to, templateId, vars, recipientOptedOut, idempotencyKey, cfg } = result.data;

  const sendResult = await sendTemplatedSms({
    cfg,
    to,
    templateId,
    vars,
    recipientOptedOut,
    idempotencyKey,
  });

  return NextResponse.json({ sent: sendResult.sent, reason: sendResult.reason }, { status: 200 });
}

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sendTemplatedSms } from "@/lib/sms/send";
import { TEMPLATE_IDS } from "@/lib/sms/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const orgCfgSchema = z.object({
  orgId: z.string().min(1).max(256),
  tenDlcRegistered: z.boolean(),
  smsEnabled: z.boolean(),
});

const bodySchema = z.object({
  orgId: z.string().min(1).max(256),
  to: z.string().min(1).max(30),
  templateId: z.enum(TEMPLATE_IDS),
  vars: z.record(z.string()),
  recipientOptedOut: z.boolean(),
  idempotencyKey: z.string().min(1).max(256),
  cfg: orgCfgSchema,
});

function verifySignature(rawBody: string, sigHeader: string | null): boolean {
  const secretHex =
    process.env.ROBERT_APP_SECRET ?? process.env.FIELDCLOSE_APP_SECRET ?? "";
  if (!sigHeader || secretHex.length === 0) return false;

  const parts: Record<string, string> = {};
  for (const chunk of sigHeader.split(",")) {
    const eq = chunk.indexOf("=");
    if (eq > 0) parts[chunk.slice(0, eq)] = chunk.slice(eq + 1);
  }

  const { t, v1 } = parts;
  if (!t || !v1) return false;

  const ts = parseInt(t, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const expected = createHmac("sha256", Buffer.from(secretHex, "hex"))
    .update(`${t}.${rawBody}`)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text();

  if (!verifySignature(rawBody, req.headers.get("X-Robert-Signature"))) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "invalid_input" }, { status: 400 });
  }

  const { orgId, to, templateId, vars, recipientOptedOut, idempotencyKey, cfg } = parsed.data;

  if (orgId !== cfg.orgId) {
    return NextResponse.json({ ok: false, reason: "org_id_mismatch" }, { status: 400 });
  }

  const result = await sendTemplatedSms({
    cfg,
    to,
    templateId,
    vars,
    recipientOptedOut,
    idempotencyKey,
  });

  return NextResponse.json(result, { status: 200 });
}

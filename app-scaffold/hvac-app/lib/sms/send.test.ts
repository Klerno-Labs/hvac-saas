import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/fieldclose-events", () => ({
  emitOutboundSmsIntent: vi.fn().mockResolvedValue(undefined),
}));

import { sendTemplatedSms } from "./send";
import type { SendSmsRequest, OrgSmsConfig } from "./send";
import * as events from "@/lib/fieldclose-events";

const registeredCfg: OrgSmsConfig = {
  orgId: "org_test",
  smsEnabled: true,
  tenDlcRegistered: true,
};

const baseRequest: SendSmsRequest = {
  cfg: registeredCfg,
  to: "+15551234567",
  templateId: "appointment_reminder",
  vars: { body: "Your appointment is tomorrow at 9am." },
  recipientOptedOut: false,
  idempotencyKey: "idem-001",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendTemplatedSms", () => {
  it("blocks send and does not emit when org is not 10DLC registered", async () => {
    const req: SendSmsRequest = {
      ...baseRequest,
      cfg: { ...registeredCfg, tenDlcRegistered: false },
    };
    const result = await sendTemplatedSms(req);
    expect(result).toEqual({ sent: false, reason: "not_10dlc_registered" });
    expect(events.emitOutboundSmsIntent).not.toHaveBeenCalled();
  });

  it("blocks send and does not emit when recipient has opted out", async () => {
    const req: SendSmsRequest = { ...baseRequest, recipientOptedOut: true };
    const result = await sendTemplatedSms(req);
    expect(result).toEqual({ sent: false, reason: "opted_out" });
    expect(events.emitOutboundSmsIntent).not.toHaveBeenCalled();
  });

  it("returns sent:true, emits exactly once, and body contains STOP footer when fully enabled", async () => {
    const result = await sendTemplatedSms(baseRequest);
    expect(result).toEqual({ sent: true });
    expect(events.emitOutboundSmsIntent).toHaveBeenCalledOnce();
    const call = vi.mocked(events.emitOutboundSmsIntent).mock.calls[0][0];
    expect(call.body).toContain("Reply STOP to opt out");
  });

  it("passes idempotency key unchanged to emitter on duplicate calls so Robert can dedupe", async () => {
    await sendTemplatedSms(baseRequest);
    await sendTemplatedSms(baseRequest);
    const calls = vi.mocked(events.emitOutboundSmsIntent).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].idempotencyKey).toBe("idem-001");
    expect(calls[1][0].idempotencyKey).toBe("idem-001");
  });
});

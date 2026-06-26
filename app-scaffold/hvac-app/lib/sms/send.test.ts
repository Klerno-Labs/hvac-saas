import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/fieldclose-events");

import { sendTemplatedSms } from "@/lib/sms/send";
import { emitOutboundSmsIntent } from "@/lib/fieldclose-events";
import type { OrgSmsConfig } from "@/lib/sms/send-gate";

const registeredCfg: OrgSmsConfig = {
  orgId: "org_1",
  tenDlcRegistered: true,
  smsEnabled: true,
};

const unregisteredCfg: OrgSmsConfig = {
  orgId: "org_1",
  tenDlcRegistered: false,
  smsEnabled: true,
};

describe("sendTemplatedSms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(emitOutboundSmsIntent).mockResolvedValue(undefined);
  });

  it('returns {sent:false, reason:"not_10dlc_registered"} and does not emit when org is unregistered', async () => {
    const result = await sendTemplatedSms({
      cfg: unregisteredCfg,
      to: "+15551234567",
      templateId: "collection_reminder",
      vars: { customerName: "Alice", invoiceNumber: "42", amount: "$100", orgName: "HVAC Co" },
      recipientOptedOut: false,
      idempotencyKey: "key_001",
    });

    expect(result).toEqual({ sent: false, reason: "not_10dlc_registered" });
    expect(emitOutboundSmsIntent).not.toHaveBeenCalled();
  });

  it("returns {sent:false} and does not emit when recipient is opted out", async () => {
    const result = await sendTemplatedSms({
      cfg: registeredCfg,
      to: "+15551234567",
      templateId: "collection_reminder",
      vars: { customerName: "Bob", invoiceNumber: "43", amount: "$200", orgName: "HVAC Co" },
      recipientOptedOut: true,
      idempotencyKey: "key_002",
    });

    expect(result.sent).toBe(false);
    expect(emitOutboundSmsIntent).not.toHaveBeenCalled();
  });

  it("returns {sent:true}, emits exactly once, and body contains STOP footer", async () => {
    const result = await sendTemplatedSms({
      cfg: registeredCfg,
      to: "+15551234567",
      templateId: "collection_reminder",
      vars: { customerName: "Carol", invoiceNumber: "44", amount: "$300", orgName: "HVAC Co" },
      recipientOptedOut: false,
      idempotencyKey: "key_003",
    });

    expect(result).toEqual({ sent: true });
    expect(emitOutboundSmsIntent).toHaveBeenCalledOnce();
    const emitArg = vi.mocked(emitOutboundSmsIntent).mock.calls[0][0];
    expect(emitArg.body).toContain("STOP");
  });

  it("passes the idempotencyKey unchanged to the emitter for Robert deduplication", async () => {
    const key = "idempotent_key_xyz";

    await sendTemplatedSms({
      cfg: registeredCfg,
      to: "+15551234567",
      templateId: "appointment_reminder",
      vars: { customerName: "Dave", orgName: "HVAC Co", date: "2026-07-01", time: "10:00 AM" },
      recipientOptedOut: false,
      idempotencyKey: key,
    });

    expect(vi.mocked(emitOutboundSmsIntent).mock.calls[0][0].idempotencyKey).toBe(key);
  });
});

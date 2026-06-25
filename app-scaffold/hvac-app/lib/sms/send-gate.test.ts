import { describe, it, expect } from "vitest";
import {
  canSendSms,
  defaultOrgSmsConfig,
  type OrgSmsConfig,
} from "./send-gate";

const fullyClearConfig: OrgSmsConfig = {
  orgId: "org_test",
  tenDlcRegistered: true,
  smsEnabled: true,
  messagingServiceSid: "MG123",
};

describe("canSendSms", () => {
  it("returns not_10dlc_registered when tenDlcRegistered is false, even if everything else is set", () => {
    const cfg: OrgSmsConfig = { ...fullyClearConfig, tenDlcRegistered: false };
    const result = canSendSms(cfg, false);
    expect(result).toEqual({ allowed: false, reason: "not_10dlc_registered" });
  });

  it("10DLC gate dominates even when smsEnabled=true, sid present, and recipient not opted out", () => {
    const cfg: OrgSmsConfig = {
      orgId: "org_test",
      tenDlcRegistered: false,
      smsEnabled: true,
      messagingServiceSid: "MG123",
    };
    expect(canSendSms(cfg, false)).toEqual({
      allowed: false,
      reason: "not_10dlc_registered",
    });
  });

  it("returns sms_disabled when registered but smsEnabled is false", () => {
    const cfg: OrgSmsConfig = {
      ...fullyClearConfig,
      smsEnabled: false,
    };
    expect(canSendSms(cfg, false)).toEqual({
      allowed: false,
      reason: "sms_disabled",
    });
  });

  it("returns missing_messaging_service when registered+enabled but no messagingServiceSid", () => {
    const cfg: OrgSmsConfig = {
      orgId: "org_test",
      tenDlcRegistered: true,
      smsEnabled: true,
    };
    expect(canSendSms(cfg, false)).toEqual({
      allowed: false,
      reason: "missing_messaging_service",
    });
  });

  it("returns recipient_opted_out when recipient has opted out", () => {
    expect(canSendSms(fullyClearConfig, true)).toEqual({
      allowed: false,
      reason: "recipient_opted_out",
    });
  });

  it("returns allowed:true when all conditions are met and recipient has not opted out", () => {
    expect(canSendSms(fullyClearConfig, false)).toEqual({ allowed: true });
  });
});

describe("defaultOrgSmsConfig", () => {
  it("is deny-by-default: tenDlcRegistered and smsEnabled are both false", () => {
    const cfg = defaultOrgSmsConfig("org_new");
    expect(cfg.tenDlcRegistered).toBe(false);
    expect(cfg.smsEnabled).toBe(false);
    expect(cfg.orgId).toBe("org_new");
  });

  it("default config cannot satisfy canSendSms", () => {
    const cfg = defaultOrgSmsConfig("org_new");
    const result = canSendSms(cfg, false);
    expect(result).toEqual({ allowed: false, reason: "not_10dlc_registered" });
  });
});

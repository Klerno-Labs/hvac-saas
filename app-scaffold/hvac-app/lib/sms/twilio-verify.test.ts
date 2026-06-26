import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";

// server-only throws in Vitest's node environment (no react-server condition)
vi.mock("server-only", () => ({}));

import { verifyTwilioSignature } from "./twilio-verify";

const TOKEN = "test_auth_token_abc123";
const URL = "https://example.com/api/sms/inbound";
const PARAMS = { Body: "Hello", From: "+15551234567", MessageSid: "SM123", To: "+15559876543" };

function computeSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const sorted = Object.keys(params).sort();
  const str = url + sorted.map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(str).digest("base64");
}

describe("verifyTwilioSignature", () => {
  it("accepts a known-good signature", () => {
    const sig = computeSignature(TOKEN, URL, PARAMS);
    expect(verifyTwilioSignature({ authToken: TOKEN, signatureHeader: sig, url: URL, params: PARAMS })).toBe(true);
  });

  it("rejects when a param value is changed", () => {
    const sig = computeSignature(TOKEN, URL, { ...PARAMS, Body: "STOP" });
    expect(verifyTwilioSignature({ authToken: TOKEN, signatureHeader: sig, url: URL, params: PARAMS })).toBe(false);
  });

  it("rejects a null signature header without throwing", () => {
    expect(verifyTwilioSignature({ authToken: TOKEN, signatureHeader: null, url: URL, params: PARAMS })).toBe(false);
  });

  it("rejects garbage header without throwing", () => {
    expect(verifyTwilioSignature({ authToken: TOKEN, signatureHeader: "not-valid!!!", url: URL, params: PARAMS })).toBe(false);
  });
});

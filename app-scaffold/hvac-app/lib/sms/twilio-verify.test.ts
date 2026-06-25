import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";

// server-only is a Next.js virtual module that throws in browser contexts.
// In Node/vitest it resolves to an empty module — mock it to avoid any
// resolution issues when running tests outside the Next.js bundler.
vi.mock("server-only", () => ({}));

import { verifyTwilioSignature } from "./twilio-verify";

const TOKEN = "test-auth-token-abc123";
const URL = "https://example.fieldclose.app/api/sms/inbound";
const PARAMS = {
  Body: "Hello",
  From: "+15551234567",
  MessageSid: "SMabc123",
  To: "+15559876543",
};

function computeSignature(token: string, url: string, params: Record<string, string>): string {
  const sortedStr = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");
  return createHmac("sha1", token).update(url + sortedStr).digest("base64");
}

describe("verifyTwilioSignature", () => {
  it("returns true for a correctly computed signature", () => {
    const sig = computeSignature(TOKEN, URL, PARAMS);
    expect(verifyTwilioSignature({ authToken: TOKEN, signatureHeader: sig, url: URL, params: PARAMS })).toBe(true);
  });

  it("returns false when a param value is tampered", () => {
    const sig = computeSignature(TOKEN, URL, PARAMS);
    const tampered = { ...PARAMS, Body: "Tampered" };
    expect(verifyTwilioSignature({ authToken: TOKEN, signatureHeader: sig, url: URL, params: tampered })).toBe(false);
  });

  it("returns false for a null signature header", () => {
    expect(verifyTwilioSignature({ authToken: TOKEN, signatureHeader: null, url: URL, params: PARAMS })).toBe(false);
  });

  it("returns false for a garbage signature header without throwing", () => {
    expect(verifyTwilioSignature({ authToken: TOKEN, signatureHeader: "not-a-valid-sig!!", url: URL, params: PARAMS })).toBe(false);
  });
});

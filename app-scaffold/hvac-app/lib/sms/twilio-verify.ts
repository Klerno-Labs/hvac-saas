import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyTwilioSignature(opts: {
  authToken: string;
  signatureHeader: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  try {
    const { authToken, signatureHeader, url, params } = opts;
    if (!signatureHeader) return false;

    // Twilio scheme: URL + sorted param keys each concatenated with their value
    const sorted = Object.keys(params).sort();
    const validationString = url + sorted.map((k) => k + params[k]).join("");

    const expectedBase64 = createHmac("sha1", authToken)
      .update(validationString)
      .digest("base64");

    const expected = Buffer.from(expectedBase64);
    const received = Buffer.from(signatureHeader);

    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

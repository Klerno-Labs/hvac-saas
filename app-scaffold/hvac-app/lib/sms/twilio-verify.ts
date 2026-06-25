import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies an inbound Twilio request signature.
 *
 * Twilio's scheme: HMAC-SHA1(authToken, url + sorted POST params), base64.
 * The auth token is used as the raw HMAC key string (not hex-decoded).
 * Returns false (never throws) on any malformed input.
 */
export function verifyTwilioSignature(opts: {
  authToken: string;
  signatureHeader: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  try {
    if (!opts.signatureHeader) return false;

    const sortedParams = Object.keys(opts.params)
      .sort()
      .map((k) => `${k}${opts.params[k]}`)
      .join("");
    const validationString = opts.url + sortedParams;

    const mac = createHmac("sha1", opts.authToken)
      .update(validationString)
      .digest("base64");

    const expected = Buffer.from(mac);
    const received = Buffer.from(opts.signatureHeader);

    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

"use client";
import { track } from "@vercel/analytics";
import {
  isFunnelEvent,
  isPublicFunnelPath,
  type FunnelEvent,
} from "./public-funnel";

/** Only fixed event names and public pathnames leave the browser. Never send form values or URLs with tokens. */
export function trackPublicFunnel(event: FunnelEvent) {
  // Custom events require an eligible Vercel Analytics plan and explicit activation.
  if (process.env.NEXT_PUBLIC_ENABLE_FUNNEL_EVENTS !== "true") return;
  if (
    typeof window === "undefined" ||
    !isFunnelEvent(event) ||
    !isPublicFunnelPath(window.location.pathname)
  )
    return;
  if (
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl
  )
    return;
  try {
    track(event, { page: window.location.pathname });
  } catch {
    /* Analytics must never block the workflow. */
  }
}

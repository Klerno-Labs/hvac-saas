"use client";
import { Analytics } from "@vercel/analytics/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  isPublicFunnelPath,
  sanitizedPublicEventUrl,
} from "@/lib/public-funnel";
import { trackPublicFunnel } from "@/lib/track-public-funnel";

// Portal URLs are bearer credentials. Never transmit them to analytics.
export function PublicAnalytics() {
  const pathname = usePathname();
  const isPublic = isPublicFunnelPath(pathname);
  useEffect(() => {
    if (!isPublic) return;
    function click(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const destination = new URL(anchor.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === "/signup")
        trackPublicFunnel("signup_clicked");
      if (destination.pathname === "/demo") trackPublicFunnel("demo_opened");
    }
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [isPublic, pathname]);
  // Avoid loading an unavailable paid-provider script on self-hosted/public pages.
  if (!isPublic || process.env.NEXT_PUBLIC_ENABLE_WEB_ANALYTICS !== "true") return null;
  return (
    <Analytics
      beforeSend={(event) => {
        if (
          navigator.doNotTrack === "1" ||
          (navigator as Navigator & { globalPrivacyControl?: boolean })
            .globalPrivacyControl
        )
          return null;
        const url = sanitizedPublicEventUrl(event.url);
        return url ? { ...event, url } : null;
      }}
    />
  );
}

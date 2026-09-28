export const PUBLIC_PAGES = [
  "/",
  "/pricing",
  "/faq",
  "/demo",
  "/help",
  "/tools/paperwork-calculator",
] as const;
export function isPublicFunnelPath(pathname: string) {
  return (
    (PUBLIC_PAGES as readonly string[]).includes(pathname) ||
    /^\/help\/[a-z][a-z-]{1,70}$/.test(pathname)
  );
}
export const FUNNEL_EVENTS = [
  "signup_clicked",
  "demo_opened",
  "demo_started",
  "demo_completed",
  "plan_recommended",
  "calculator_used",
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];
export function isFunnelEvent(event: unknown): event is FunnelEvent {
  return (
    typeof event === "string" &&
    (FUNNEL_EVENTS as readonly string[]).includes(event)
  );
}
export function sanitizedPublicEventUrl(value: string) {
  try {
    const url = new URL(value);
    if (!isPublicFunnelPath(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

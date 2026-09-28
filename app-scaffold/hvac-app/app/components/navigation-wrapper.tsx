import { getOptionalSession } from "@/lib/session";
import { NavHeader } from "./nav-header";
import { unstable_rethrow } from "next/navigation";

export async function NavigationWrapper() {
  // Navigation is optional decoration. A stale cookie or database outage must
  // not turn a public Help page into an error. Private pages run their own guard.
  const session = await getOptionalSession().catch(error => {
    unstable_rethrow(error);
    return null;
  });
  return <NavHeader role={session?.membership?.role ?? null} />;
}

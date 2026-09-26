import { getOptionalSession } from "@/lib/session";
import { NavHeader } from "./nav-header";

export async function NavigationWrapper() {
  const session = await getOptionalSession();
  return <NavHeader role={session?.membership?.role ?? null} />;
}

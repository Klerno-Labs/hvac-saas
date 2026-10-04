import Link from "next/link";
import { Wrench } from "lucide-react";

export function PublicHeader() {
  return (
    <header className="app-topbar">
      <div className="app-topbar-inner">
        <Link href="/" className="app-brand">
          <Wrench size={24} aria-hidden="true" />
          FieldClose<span className="text-[#00add6] -ml-2">.</span>
        </Link>
        <Link href="/login" className="button">
          Sign in
        </Link>
      </div>
    </header>
  );
}

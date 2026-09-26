"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MenuIcon, Wrench } from "lucide-react";
import { canDo, type Capability } from "@/lib/permissions";

const NAV_ITEMS: { href: string; label: string; capability?: Capability }[] = [
  { href: "/dashboard", label: "Overview", capability: "viewAllJobs" },
  { href: "/field", label: "Field view", capability: "fieldWork" },
  { href: "/customers", label: "Customers", capability: "manageCustomers" },
  { href: "/jobs", label: "Jobs", capability: "fieldWork" },
  { href: "/calendar", label: "Calendar", capability: "fieldWork" },
  { href: "/estimates", label: "Estimates", capability: "editPricing" },
  { href: "/invoices", label: "Invoices", capability: "editPricing" },
  { href: "/pricebook", label: "Pricebook", capability: "editPricing" },
  { href: "/inventory", label: "Inventory", capability: "manageInventory" },
  { href: "/reports", label: "Reports", capability: "editPricing" },
  { href: "/reminders", label: "Reminders", capability: "manageJobs" },
  { href: "/recurring", label: "Recurring", capability: "manageJobs" },
  { href: "/settings", label: "Settings" },
];
export function NavHeader({ role }: { role: string | null }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  if (
    !role ||
    !NAV_ITEMS.some(
      (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
    )
  )
    return null;
  const items = NAV_ITEMS.filter(
    (item) => !item.capability || canDo(role, item.capability),
  ).map((item) => (
    <Link
      key={item.href}
      href={item.href as never}
      aria-current={
        pathname === item.href || pathname.startsWith(item.href + "/")
          ? "page"
          : undefined
      }
      onClick={() => setOpen(false)}
    >
      {item.label}
    </Link>
  ));
  return (
    <header className="app-topbar">
      <div className="app-topbar-inner">
        <div className="flex items-center gap-3">
          <div className="lg:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open navigation"
                    className="min-h-11 min-w-11"
                  />
                }
              >
                <MenuIcon size={20} />
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>FieldClose</SheetTitle>
                </SheetHeader>
                <nav
                  aria-label="Mobile navigation"
                  className="app-nav flex-col! items-stretch! w-full! px-4!"
                >
                  {items}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
          <Link
            href={canDo(role, "viewAllJobs") ? "/dashboard" : "/field"}
            className="app-brand"
          >
            <Wrench size={24} aria-hidden="true" />
            FieldClose<span className="text-[#00add6] -ml-2">.</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline text-xs text-muted-foreground max-w-48 truncate">
            {session?.user?.name}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="min-h-10"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </Button>
        </div>
      </div>
      <nav aria-label="Main navigation" className="app-nav hidden! lg:flex!">
        {items}
      </nav>
    </header>
  );
}

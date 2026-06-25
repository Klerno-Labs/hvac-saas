'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet'
import { MenuIcon } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/customers', label: 'Customers' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/dispatch', label: 'Dispatch' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/estimates', label: 'Estimates' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/reports', label: 'Reports' },
  { href: '/reminders', label: 'Reminders' },
  { href: '/recurring', label: 'Recurring' },
  { href: '/settings', label: 'Settings' },
]

export function NavHeader() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)

  const hideOn = ['/login', '/signup', '/onboarding', '/portal', '/pay']
  if (hideOn.some((p) => pathname.startsWith(p)) || pathname === '/') {
    return null
  }

  return (
    <header className="sticky top-0 z-50 bg-card border-b">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between h-14 px-4">
        {/* Mobile: hamburger + logo */}
        <div className="flex items-center gap-2 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Open menu" />
              }
            >
              <MenuIcon className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetHeader>
                <SheetTitle>
                  <span className="font-bold text-primary text-base">FieldClose</span>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4 mt-2">
                {NAV_ITEMS.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <SheetClose key={item.href} render={<span />}>
                      <Link
                        href={item.href as never}
                        className={`block text-sm px-3 py-2.5 rounded-md no-underline transition-colors ${
                          isActive
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                        onClick={() => setOpen(false)}
                      >
                        {item.label}
                      </Link>
                    </SheetClose>
                  )
                })}
              </nav>
              <div className="mt-auto px-4 pb-4">
                <Separator className="my-4" />
                {session?.user?.name && (
                  <p className="text-xs text-muted-foreground mb-3">{session.user.name}</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                >
                  Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <Link
            href="/dashboard"
            className="font-bold text-primary text-base no-underline"
          >
            FieldClose
          </Link>
        </div>

        {/* Desktop: horizontal nav */}
        <div className="hidden md:flex items-center gap-1">
          <Link
            href="/dashboard"
            className="font-bold text-primary text-base no-underline mr-4 whitespace-nowrap"
          >
            FieldClose
          </Link>
          <Separator orientation="vertical" className="h-6 mr-2" />
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href as never}
                className={`text-[13px] px-3 py-1.5 rounded-md no-underline whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Desktop: sign out */}
        <div className="hidden md:flex items-center gap-3 ml-4">
          {session?.user?.name && (
            <span className="text-xs text-muted-foreground">
              {session.user.name}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs"
          >
            Sign out
          </Button>
        </div>

        {/* Mobile: sign out button (compact) */}
        <div className="md:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs"
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}

import type { ReactNode } from 'react'
import { Providers } from '@/app/providers'
import { NavigationWrapper } from './navigation-wrapper'
import { TrialBannerWrapper } from './trial-banner-wrapper'
import { SWRegister } from './sw-register'

/** Private workspace decoration only. Pages and actions keep their own access guards. */
export function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return <Providers>
    <a className="app-skip" href="#main-content">Skip to content</a>
    <NavigationWrapper />
    <TrialBannerWrapper />
    <div id="main-content" tabIndex={-1}>{children}</div>
    <SWRegister />
  </Providers>
}

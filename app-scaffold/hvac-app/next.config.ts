import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
}

export default nextConfig

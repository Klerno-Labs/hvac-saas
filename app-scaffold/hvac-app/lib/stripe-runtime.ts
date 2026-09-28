import { isProductionDeployment } from './deployment-runtime'

type RuntimeEnvironment = Record<string, string | undefined>

/** Safe runtime capability only: never return the configured credential. */
export function getStripeRuntimeAvailability(env: RuntimeEnvironment = process.env) {
  const key = env.STRIPE_SECRET_KEY?.trim()
  const mode = key?.match(/^(?:sk|rk)_(test|live)_[A-Za-z0-9_]+$/)?.[1] as 'test' | 'live' | undefined
  if (!mode || (isProductionDeployment(env) && mode !== 'live')) {
    return { available: false, mode: mode ?? null } as const
  }
  return { available: true, mode } as const
}

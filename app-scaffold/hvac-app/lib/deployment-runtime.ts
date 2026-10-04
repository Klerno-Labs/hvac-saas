type RuntimeEnvironment = Record<string, string | undefined>

/** Explicit host-independent production boundary; a Vercel production marker cannot be downgraded. */
export function isProductionDeployment(env: RuntimeEnvironment = process.env) {
  return env.DEPLOYMENT_ENV === 'production' || env.VERCEL_ENV === 'production'
}

export function requiresRemotePhotoStorage(env: RuntimeEnvironment = process.env) {
  return env.VERCEL === '1' || isProductionDeployment(env)
}

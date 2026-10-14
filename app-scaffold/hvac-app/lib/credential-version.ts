import { createHash } from 'node:crypto'

/** A non-reversible version marker; never put password hashes themselves in JWTs. */
export function credentialVersion(hashedPassword: string | null | undefined): string {
  return createHash('sha256').update(`fieldclose-credential-v1:${hashedPassword ?? 'oauth-only'}`).digest('hex')
}

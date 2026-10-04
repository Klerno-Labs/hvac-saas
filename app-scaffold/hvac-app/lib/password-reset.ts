import { createHash } from 'node:crypto'
import { db } from '@/lib/db'

export function resetTokenDigest(token: string) {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`
}

/** Consume one reset capability and change the password in the same transaction. */
export async function consumePasswordReset(token: string, hashedPassword: string): Promise<boolean> {
  return db.$transaction(async tx => {
    const reset = await tx.passwordResetToken.findFirst({
      // Legacy raw tokens remain usable for their existing one-hour lifetime.
      where: { token: { in: [resetTokenDigest(token), token] } },
    })
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) return false
    const user = await tx.user.findUnique({ where: { email: reset.email } })
    if (!user) return false
    // Serialize all reset links for one user; only the first valid claimant wins.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`
    const now = new Date()
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    })
    if (claimed.count !== 1) return false
    await tx.user.update({ where: { id: user.id }, data: { hashedPassword } })
    await tx.passwordResetToken.updateMany({ where: { email: reset.email, usedAt: null }, data: { usedAt: now } })
    // Also revoke database sessions in case an OAuth adapter created any.
    await tx.session.deleteMany({ where: { userId: user.id } })
    return true
  })
}

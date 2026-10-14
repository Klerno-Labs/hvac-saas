import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { auth } = await import('@/lib/auth')
const { acceptInvite } = await import('@/app/invite/[token]/actions')
const { consumePasswordReset, resetTokenDigest } = await import('@/lib/password-reset')
let organizationId: string
const userIds: string[] = []
beforeAll(async () => { organizationId = (await db.organization.create({ data: { name: 'Auth entry fixture', plan: 'PRO', subscriptionStatus: 'ACTIVE' } })).id })
beforeEach(() => vi.clearAllMocks())
afterAll(async () => {
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { email: true } })
  await db.passwordResetToken.deleteMany({ where: { email: { in: users.flatMap(user => user.email ? [user.email] : []) } } })
  await db.organization.delete({ where: { id: organizationId } })
  await db.user.deleteMany({ where: { id: { in: userIds } } })
  await db.$disconnect()
})
async function user() {
  const result = await db.user.create({ data: { email: `${randomUUID()}@example.test`, hashedPassword: 'initial-hash' } })
  userIds.push(result.id)
  return result
}
async function invite(email: string) {
  return db.teamInvite.create({ data: { organizationId, email, role: 'technician', token: randomBytes(32).toString('hex'), invitedBy: 'fixture-owner', expiresAt: new Date(Date.now() + 60_000) } })
}
describe('invitation acceptance', () => {
  it('rejects a signed-in user whose email is not the recipient', async () => {
    const account = await user()
    const invitation = await invite('another-recipient@example.test')
    vi.mocked(auth).mockResolvedValue({ user: { id: account.id, email: invitation.email } } as never)
    expect(await acceptInvite(invitation.token)).toMatchObject({ success: false, error: expect.stringContaining('email address') })
    expect(await db.organizationMember.count({ where: { userId: account.id } })).toBe(0)
    expect((await db.teamInvite.findUniqueOrThrow({ where: { id: invitation.id } })).acceptedAt).toBeNull()
  })
  it('accepts concurrent retries exactly once with one membership and audit record', async () => {
    const account = await user()
    const invitation = await invite(account.email!.toUpperCase())
    vi.mocked(auth).mockResolvedValue({ user: { id: account.id } } as never)
    const results = await Promise.all([acceptInvite(invitation.token), acceptInvite(invitation.token), acceptInvite(invitation.token)])
    expect(results.every(result => result.success)).toBe(true)
    expect(await db.organizationMember.count({ where: { userId: account.id } })).toBe(1)
    expect(await db.auditLog.count({ where: { actorId: account.id, eventType: 'team_member_joined' } })).toBe(1)
  })
  it('rejects expired invitations without creating a membership', async () => {
    const account = await user()
    const invitation = await invite(account.email!)
    await db.teamInvite.update({ where: { id: invitation.id }, data: { expiresAt: new Date(0) } })
    vi.mocked(auth).mockResolvedValue({ user: { id: account.id } } as never)
    expect((await acceptInvite(invitation.token)).success).toBe(false)
    expect(await db.organizationMember.count({ where: { userId: account.id } })).toBe(0)
  })
})
describe('one-use password reset', () => {
  it('allows only one winner when one token is submitted concurrently', async () => {
    const account = await user()
    const token = randomBytes(32).toString('hex')
    await db.passwordResetToken.create({ data: { email: account.email!, token: resetTokenDigest(token), expiresAt: new Date(Date.now() + 60_000) } })
    const results = await Promise.all([consumePasswordReset(token, 'first-hash'), consumePasswordReset(token, 'second-hash')])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).hashedPassword).toBe(results[0] ? 'first-hash' : 'second-hash')
    expect(await consumePasswordReset(token, 'replay-hash')).toBe(false)
  })
  it('revokes sibling reset links and database sessions', async () => {
    const account = await user()
    const tokens = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')]
    await db.passwordResetToken.createMany({ data: tokens.map(token => ({ email: account.email!, token: resetTokenDigest(token), expiresAt: new Date(Date.now() + 60_000) })) })
    await db.session.create({ data: { userId: account.id, sessionToken: randomUUID(), expires: new Date(Date.now() + 60_000) } })
    expect(await consumePasswordReset(tokens[0], 'new-hash')).toBe(true)
    expect(await consumePasswordReset(tokens[1], 'later-hash')).toBe(false)
    expect(await db.session.count({ where: { userId: account.id } })).toBe(0)
  })
  it('rejects expired tokens and stored token digests as reset capabilities', async () => {
    const account = await user()
    const token = randomBytes(32).toString('hex')
    await db.passwordResetToken.create({ data: { email: account.email!, token: resetTokenDigest(token), expiresAt: new Date(0) } })
    expect(await consumePasswordReset(token, 'bad-hash')).toBe(false)
    expect(await consumePasswordReset(resetTokenDigest(token).slice(7), 'bad-hash')).toBe(false)
    expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).hashedPassword).toBe('initial-hash')
  })
})

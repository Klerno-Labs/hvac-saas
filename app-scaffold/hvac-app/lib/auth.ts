import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { credentialVersion } from '@/lib/credential-version'
import { limit, RL } from '@/lib/rate-limit'

type AuthorizeUser = { id: string; email: string | null; name: string | null; credentialVersion: string }

export async function authorizeCredentials(credentials: Partial<Record<string, unknown>> | undefined): Promise<AuthorizeUser | null> {
  if (!credentials?.email || !credentials?.password) return null

  const email = String(credentials.email).trim().toLowerCase()
  const password = String(credentials.password)
  if (email.length > 254 || password.length > 1024) return null

  const guard = await limit({ preset: RL.login, id: email.toLowerCase() })
  if (!guard.allowed) return null

  const user = await db.user.findUnique({ where: { email } }) ?? await db.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
  if (!user || !user.hashedPassword) return null

  const isValid = await bcrypt.compare(password, user.hashedPassword)
  if (!isValid) return null

  return { id: user.id, email: user.email, name: user.name, credentialVersion: credentialVersion(user.hashedPassword) }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID || '',
      clientSecret: process.env.AUTH_GITHUB_SECRET || '',
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        return authorizeCredentials(credentials as Partial<Record<string, unknown>> | undefined)
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      const userId = user?.id ?? token.id
      if (typeof userId !== 'string') return null
      const current = await db.user.findUnique({ where: { id: userId }, select: { hashedPassword: true } })
      if (!current) return null
      const version = credentialVersion(current.hashedPassword)
      if (user) {
        // Credentials authorization carries the version that was actually
        // checked, closing a password-reset/sign-in race.
        if ('credentialVersion' in user && user.credentialVersion !== version) return null
        token.id = userId
        token.credentialVersion = version
      } else if (token.credentialVersion !== version) {
        // Old sessions, deleted users, and changed credentials must sign in again.
        return null
      }
      return token
    },
    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})

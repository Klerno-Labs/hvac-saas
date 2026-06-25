import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

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
        if (!credentials?.email || !credentials?.password) return null

        const email = credentials.email as string
        const password = credentials.password as string

        const user = await db.user.findUnique({ where: { email } })
        if (!user || !user.hashedPassword) return null

        const isValid = await bcrypt.compare(password, user.hashedPassword)
        if (!isValid) return null

        return { id: user.id, email: user.email, name: user.name }
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
      if (user) {
        token.id = user.id
        // Attach an entitlement snapshot at sign-in so middleware can make an
        // edge-safe write decision without a DB hit. The DB lookup runs only
        // here (Node runtime, sign-in); subsequent JWT decodes on the edge are
        // pure. The authoritative server-action guard always re-queries the DB,
        // so a stale snapshot can never enable a real write for a lapsed org.
        const membership = await db.organizationMember.findFirst({
          where: { userId: user.id },
          include: {
            organization: {
              select: {
                id: true,
                plan: true,
                subscriptionStatus: true,
                trialEndsAt: true,
              },
            },
          },
        })
        if (membership?.organization) {
          token.organizationId = membership.organization.id
          token.plan = membership.organization.plan
          token.subscriptionStatus = membership.organization.subscriptionStatus
          token.trialEndsAt =
            membership.organization.trialEndsAt?.toISOString() ?? null
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string
      }
      if (token?.organizationId) {
        session.org = {
          id: token.organizationId,
          plan: token.plan!,
          subscriptionStatus: token.subscriptionStatus!,
          trialEndsAt: token.trialEndsAt ?? null,
        }
      }
      return session
    },
  },
})

import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { limit, RL } from '@/lib/rate-limit'

type AuthorizeUser = { id: string; email: string | null; name: string | null }

export async function authorizeCredentials(credentials: Partial<Record<string, unknown>> | undefined): Promise<AuthorizeUser | null> {
  if (!credentials?.email || !credentials?.password) return null

  const email = String(credentials.email)
  const password = String(credentials.password)

  const guard = await limit({ preset: RL.login, id: email.toLowerCase() })
  if (!guard.allowed) return null

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.hashedPassword) return null

  const isValid = await bcrypt.compare(password, user.hashedPassword)
  if (!isValid) return null

  return { id: user.id, email: user.email, name: user.name }
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
      if (user) {
        token.id = user.id
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

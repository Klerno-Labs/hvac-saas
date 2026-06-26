import { handlers } from '@/lib/auth'
import { getClientIp, limit } from '@/lib/rate-limit'
import { RL } from '@/lib/rate-limit/config'
import { tooManyRequests } from '@/lib/rate-limit/respond'

export const GET = handlers.GET

export async function POST(req: Request, ctx?: unknown): Promise<Response> {
  if (new URL(req.url).pathname.endsWith('/callback/credentials')) {
    let email: string | undefined
    try {
      const body = (await req.clone().json()) as Record<string, unknown>
      email = (body.email as string | undefined)?.toLowerCase()
    } catch {
      try {
        const fd = await req.clone().formData()
        email = fd.get('email')?.toString().toLowerCase()
      } catch {}
    }
    const ip = getClientIp(req)
    const r = await limit({ preset: RL.login, ip, id: email })
    if (!r.allowed) return tooManyRequests(r.retryAfterSeconds)
  }
  return (handlers.POST as unknown as (req: Request, ctx?: unknown) => Promise<Response>)(req, ctx)
}

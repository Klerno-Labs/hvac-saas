import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GET as collectionsGet, POST as collectionsPost } from '@/app/api/collections/run/route'
import { GET as recurringGet, POST as recurringPost } from '@/app/api/recurring/generate/route'
import { GET as remindersGet, POST as remindersPost } from '@/app/api/appointments/reminders/route'
import { runCollectionsAutomation } from '@/lib/collections'
import { generateDueRecurringJobs } from '@/lib/recurring-generation'
import { runAppointmentReminders } from '@/lib/appointment-reminders'
vi.mock('@/lib/collections', () => ({ runCollectionsAutomation: vi.fn() }))
vi.mock('@/lib/recurring-generation', () => ({ generateDueRecurringJobs: vi.fn() }))
vi.mock('@/lib/appointment-reminders', () => ({ runAppointmentReminders: vi.fn() }))
const vercelSecret = 'vercel-fixture-secret-at-least-32-characters'
const legacySecret = 'legacy-fixture-secret-at-least-32-characters'
const paths = [
  ['/api/collections/run', collectionsGet, collectionsPost, runCollectionsAutomation],
  ['/api/recurring/generate', recurringGet, recurringPost, generateDueRecurringJobs],
  ['/api/appointments/reminders', remindersGet, remindersPost, runAppointmentReminders],
] as const
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('CRON_SECRET', vercelSecret)
  vi.stubEnv('COLLECTIONS_CRON_SECRET', legacySecret)
  vi.stubEnv('SCHEDULED_TASKS_ENABLED', undefined)
  vi.mocked(runCollectionsAutomation).mockResolvedValue({ sent: 0 } as never)
  vi.mocked(generateDueRecurringJobs).mockResolvedValue({ generated: 0, generatedMembershipVisits: 0 })
  vi.mocked(runAppointmentReminders).mockResolvedValue({ sent: 0, errors: 0 })
})
afterEach(() => vi.unstubAllEnvs())
for (const [path, get, post, engine] of paths) {
  describe(`${path} authenticated scheduled execution`, () => {
    it.each([
      ['false', 503], ['true', 200], [undefined, 200],
    ] as const)('respects the optional execution flag %s', async (enabled, expectedStatus) => {
      vi.stubEnv('SCHEDULED_TASKS_ENABLED', enabled)
      const response = await get(new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${vercelSecret}` } }))
      expect(response.status).toBe(expectedStatus)
      if (enabled === 'false') {
        expect(await response.json()).toEqual({ error: 'Scheduled tasks are paused' })
        expect(engine).not.toHaveBeenCalled()
      } else {
        expect(engine).toHaveBeenCalledOnce()
      }
    })
    it('still requires authentication while scheduled work is paused', async () => {
      vi.stubEnv('SCHEDULED_TASKS_ENABLED', 'false')
      const response = await get(new Request(`http://localhost${path}`))
      expect(response.status).toBe(401)
      expect(engine).not.toHaveBeenCalled()
    })
    it('accepts Vercel GET with CRON_SECRET and does not cache its result', async () => {
      vi.stubEnv('COLLECTIONS_CRON_SECRET', '')
      const response = await get(new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${vercelSecret}` } }))
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(engine).toHaveBeenCalledOnce()
    })
    it('preserves legacy POST triggers during secret migration', async () => {
      const response = await post(new Request(`http://localhost${path}`, { method: 'POST', headers: { authorization: `Bearer ${legacySecret}` } }))
      expect(response.status).toBe(200)
      expect(engine).toHaveBeenCalledOnce()
    })
    it.each([undefined, 'Bearer incorrect-secret', vercelSecret, 'Bearer ', `Bearer ${vercelSecret}extra`])('rejects missing/malformed/incorrect authorization %s', async authorization => {
      const response = await get(new Request(`http://localhost${path}`, { headers: authorization ? { authorization } : {} }))
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
      expect(engine).not.toHaveBeenCalled()
    })
    it.each(['production', 'development'])('fails closed without either secret in %s', async mode => {
      vi.stubEnv('NODE_ENV', mode)
      vi.stubEnv('CRON_SECRET', '')
      vi.stubEnv('COLLECTIONS_CRON_SECRET', '')
      const response = await get(new Request(`http://localhost${path}`, { headers: { authorization: 'Bearer undefined' } }))
      expect(response.status).toBe(503)
      expect(engine).not.toHaveBeenCalled()
    })
    it('accepts a configured legacy-only secret', async () => {
      vi.stubEnv('CRON_SECRET', '')
      const response = await get(new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${legacySecret}` } }))
      expect(response.status).toBe(200)
      expect(engine).toHaveBeenCalledOnce()
    })
  })
}

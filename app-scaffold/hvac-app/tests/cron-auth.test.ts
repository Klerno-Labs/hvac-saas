import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST as collectionsRun } from '@/app/api/collections/run/route'
import { POST as recurringGenerate } from '@/app/api/recurring/generate/route'
import { GET as remindersSend } from '@/app/api/reminders/send/route'

vi.mock('@/lib/db', () => ({ db: { job: { findMany: vi.fn().mockResolvedValue([]) } } }))
vi.mock('@/lib/sms', () => ({ sendSms: vi.fn() }))

describe('cron route authentication', () => {
  beforeEach(() => {
    process.env.COLLECTIONS_CRON_SECRET = 'test-secret'
  })

  afterEach(() => {
    delete process.env.COLLECTIONS_CRON_SECRET
    vi.unstubAllEnvs()
  })

  describe('/api/collections/run', () => {
    it('rejects requests without authorization header with 401', async () => {
      const request = new Request('http://localhost:3000/api/collections/run', {
        method: 'POST'
      })
      const response = await collectionsRun(request)
      
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty('error', 'Unauthorized')
    })

    it('rejects requests with wrong secret with 401', async () => {
      const request = new Request('http://localhost:3000/api/collections/run', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer wrong-secret'
        }
      })
      const response = await collectionsRun(request)
      
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty('error', 'Unauthorized')
    })

    it('rejects requests with malformed authorization header with 401', async () => {
      const request = new Request('http://localhost:3000/api/collections/run', {
        method: 'POST',
        headers: {
          'authorization': 'test-secret'
        }
      })
      const response = await collectionsRun(request)
      
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty('error', 'Unauthorized')
    })

  it('returns 500 when COLLECTIONS_CRON_SECRET not configured in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    delete process.env.COLLECTIONS_CRON_SECRET
    const request = new Request('http://localhost:3000/api/collections/run', {
      method: 'POST',
    })
    const response = await collectionsRun(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data).toHaveProperty('error', 'COLLECTIONS_CRON_SECRET not configured')
  })
  })

  describe('/api/recurring/generate', () => {
    it('rejects requests without authorization header with 401', async () => {
      const request = new Request('http://localhost:3000/api/recurring/generate', {
        method: 'POST'
      })
      const response = await recurringGenerate(request)
      
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty('error', 'Unauthorized')
    })

    it('rejects requests with wrong secret with 401', async () => {
      const request = new Request('http://localhost:3000/api/recurring/generate', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer wrong-secret'
        }
      })
      const response = await recurringGenerate(request)
      
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty('error', 'Unauthorized')
    })

    it('rejects requests with malformed authorization header with 401', async () => {
      const request = new Request('http://localhost:3000/api/recurring/generate', {
        method: 'POST',
        headers: {
          'authorization': 'test-secret'
        }
      })
      const response = await recurringGenerate(request)
      
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty('error', 'Unauthorized')
    })

    it('returns 500 when COLLECTIONS_CRON_SECRET not configured in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      delete process.env.COLLECTIONS_CRON_SECRET
      const request = new Request('http://localhost:3000/api/recurring/generate', {
        method: 'POST',
      })
      const response = await recurringGenerate(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data).toHaveProperty('error', 'COLLECTIONS_CRON_SECRET not configured')
    })
  })

  describe('/api/reminders/send', () => {
    it('rejects GET requests without authorization header with 401', async () => {
      const request = new Request('http://localhost:3000/api/reminders/send', {
        method: 'GET',
      })
      const response = await remindersSend(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty('error', 'Unauthorized')
    })

    it('rejects GET requests with wrong secret with 401', async () => {
      const request = new Request('http://localhost:3000/api/reminders/send', {
        method: 'GET',
        headers: { authorization: 'Bearer wrong-secret' },
      })
      const response = await remindersSend(request)

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty('error', 'Unauthorized')
    })
  })
})
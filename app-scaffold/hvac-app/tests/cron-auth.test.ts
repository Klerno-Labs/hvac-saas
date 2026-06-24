import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { POST as collectionsRun } from '@/app/api/collections/run/route'
import { POST as recurringGenerate } from '@/app/api/recurring/generate/route'

describe('cron route authentication', () => {
  beforeEach(() => {
    process.env.COLLECTIONS_CRON_SECRET = 'test-secret'
  })

  afterEach(() => {
    delete process.env.COLLECTIONS_CRON_SECRET
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
    delete process.env.COLLECTIONS_CRON_SECRET
    const request = new Request('http://localhost:3000/api/collections/run', {
      method: 'POST',
      headers: {
        'x-vercel-env': 'production',
      },
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
      delete process.env.COLLECTIONS_CRON_SECRET
      const request = new Request('http://localhost:3000/api/recurring/generate', {
        method: 'POST',
        headers: {
          'x-vercel-env': 'production',
        },
      })
      const response = await recurringGenerate(request)
      
      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data).toHaveProperty('error', 'COLLECTIONS_CRON_SECRET not configured')
    })
  })
})
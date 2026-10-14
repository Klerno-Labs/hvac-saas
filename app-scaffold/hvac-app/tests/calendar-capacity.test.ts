import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { db } from '@/lib/db'
import { requireActiveSubscription } from '@/lib/session'
import CalendarPage from '@/app/calendar/page'
import JobsPage from '@/app/jobs/page'
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { job: { findMany: vi.fn(), count: vi.fn() } } }))
vi.mock('@/lib/session', () => ({ requireActiveSubscription: vi.fn() }))
vi.mock('@/app/components/search-input', () => ({ SearchInput: () => null }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireActiveSubscription).mockResolvedValue({ userId: 'tech', role: 'technician', organizationId: 'org', organization: { timezone: 'America/Chicago' } } as never)
  vi.mocked(db.job.findMany).mockResolvedValue([])
  vi.mocked(db.job.count).mockResolvedValue(0)
})
describe('crowded calendar and complete day schedule', () => {
  it('bounds each day preview and links to all jobs instead of silently dropping them', async () => {
    vi.mocked(db.job.findMany).mockResolvedValue(Array.from({ length: 50 }, (_, i) => ({ id: `job-${i}`, title: `Visit ${i}`, status: 'scheduled', scheduledFor: new Date('2026-08-03T00:00:00Z') })) as never)
    const html = renderToStaticMarkup(await CalendarPage({ searchParams: Promise.resolve({ month: '2026-08' }) }))
    expect((html.match(/href="\/jobs\/job-/g) || [])).toHaveLength(3)
    expect(html).toContain('/jobs?day=2026-08-03')
    expect(html).toContain('+47 more')
    expect(html).toContain('View all 50 jobs')
  })
  it('day drill-down preserves tenant, assignment and pagination', async () => {
    await JobsPage({ searchParams: Promise.resolve({ day: '2026-08-03', page: '2', status: 'booked' }) })
    const where = { organizationId: 'org', assignedUserId: 'tech', status: 'booked', scheduledFor: { gte: new Date('2026-08-03T00:00:00Z'), lt: new Date('2026-08-04T00:00:00Z') } }
    expect(db.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 20, take: 20 }))
    expect(db.job.count).toHaveBeenCalledWith({ where })
  })
  it.each(['2026-02-30', 'garbage', '2026-08-03T00:00:00Z'])('ignores invalid day %s without a database date error', async day => {
    await JobsPage({ searchParams: Promise.resolve({ day }) })
    expect(db.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org', assignedUserId: 'tech' } }))
  })
  it('retains day in status links and pagination', async () => {
    vi.mocked(db.job.count).mockResolvedValue(45)
    vi.mocked(db.job.findMany).mockResolvedValue([{ id: 'job1', title: 'Visit', status: 'scheduled', scheduledFor: new Date('2026-08-03T00:00:00Z'), customer: { firstName: 'Test' } }] as never)
    const html = renderToStaticMarkup(await JobsPage({ searchParams: Promise.resolve({ day: '2026-08-03' }) }))
    expect(html).toContain('status=booked&amp;day=2026-08-03')
    expect(html).toMatch(/href="[^"]*page=2[^"]*day=2026-08-03|href="[^"]*day=2026-08-03[^"]*page=2/)
  })
})

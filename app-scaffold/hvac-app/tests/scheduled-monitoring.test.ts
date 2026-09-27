import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), flush: vi.fn() }))
vi.mock('@/lib/collections', () => ({ runCollectionsAutomation: vi.fn() }))
vi.mock('@/lib/recurring-generation', () => ({ generateDueRecurringJobs: vi.fn() }))
vi.mock('@/lib/appointment-reminders', () => ({ runAppointmentReminders: vi.fn() }))

import { captureException, flush } from '@sentry/nextjs'
import { GET as collectionsGet } from '@/app/api/collections/run/route'
import { GET as recurringGet } from '@/app/api/recurring/generate/route'
import { GET as remindersGet } from '@/app/api/appointments/reminders/route'
import { runCollectionsAutomation } from '@/lib/collections'
import { generateDueRecurringJobs } from '@/lib/recurring-generation'
import { runAppointmentReminders } from '@/lib/appointment-reminders'

const request = () => new Request('http://localhost/api/fixture', { headers: { authorization: 'Bearer fixture-cron-secret' } })
const collectionResult = { organizationsProcessed: 1, attemptsCreated: 1, attemptsSkipped: 0, channelsAccepted: 1, errors: 0, needsReview: 0 }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('CRON_SECRET', 'fixture-cron-secret')
  vi.stubEnv('COLLECTIONS_CRON_SECRET', '')
  vi.stubEnv('SCHEDULED_TASKS_ENABLED', 'true')
  vi.stubEnv('SENTRY_DSN', 'https://fixture@monitoring.example.test/1')
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.mocked(flush).mockResolvedValue(true)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('scheduled task failure observability', () => {
  it('reports partial appointment delivery without throwing or requesting a whole-batch replay', async () => {
    vi.mocked(runAppointmentReminders).mockResolvedValue({ sent: 2, errors: 1 })
    const response = await remindersGet(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ success: false, sent: 2, errors: 1 })
    expect(runAppointmentReminders).toHaveBeenCalledOnce()
    expect(captureException).toHaveBeenCalledOnce()
    expect(flush).toHaveBeenCalledWith(2000)
    expect(vi.mocked(captureException).mock.calls[0][0]).toMatchObject({ name: 'AppointmentReminderPartialFailure', message: 'Scheduled work needs operator review' })
  })

  it.each([{ errors: 1, needsReview: 0 }, { errors: 0, needsReview: 1 }])('reports collection failure or review without discarding accepted-channel counts: %j', counts => {
    vi.mocked(runCollectionsAutomation).mockResolvedValue({ ...collectionResult, ...counts })
    return collectionsGet(request()).then(async response => {
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ success: false, channelsAccepted: 1, ...counts })
      expect(vi.mocked(captureException).mock.calls[0][0]).toMatchObject({ name: 'CollectionAutomationPartialFailure' })
    })
  })

  it.each([
    [remindersGet, runAppointmentReminders, 'AppointmentReminderFailure'],
    [collectionsGet, runCollectionsAutomation, 'CollectionAutomationFailure'],
    [recurringGet, generateDueRecurringJobs, 'RecurringGenerationFailure'],
  ] as const)('reports escaped engine failure with no raw provider details', async (handler, engine, name) => {
    const privateDetails = 'customer@example.test https://portal.invalid/private-token provider-secret'
    vi.mocked(engine).mockRejectedValue(new Error(privateDetails))
    const response = await handler(request())
    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).not.toContain(privateDetails)
    const captured = vi.mocked(captureException).mock.calls[0][0] as Error
    expect(captured.name).toBe(name)
    expect(captured.message).toBe('Scheduled work needs operator review')
    expect(captured.cause).toBeUndefined()
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(privateDetails)
  })

  it('keeps partial outcomes visible if monitoring is unavailable', async () => {
    vi.mocked(runAppointmentReminders).mockResolvedValue({ sent: 1, errors: 1 })
    vi.mocked(captureException).mockImplementation(() => { throw new Error('SDK unavailable') })
    expect(await (await remindersGet(request())).json()).toEqual({ success: false, sent: 1, errors: 1 })
    expect(runAppointmentReminders).toHaveBeenCalledOnce()
  })

  it('does not replay delivery or fail the partial response when the reporting flush rejects', async () => {
    vi.mocked(runAppointmentReminders).mockResolvedValue({ sent: 1, errors: 1 })
    vi.mocked(flush).mockRejectedValue(new Error('private transport detail'))
    expect(await (await remindersGet(request())).json()).toEqual({ success: false, sent: 1, errors: 1 })
    expect(runAppointmentReminders).toHaveBeenCalledOnce()
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private transport detail')
  })

  it('does not initialize reporting without a destination or report successful runs as failures', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.mocked(runAppointmentReminders).mockResolvedValue({ sent: 0, errors: 1 })
    expect(await (await remindersGet(request())).json()).toMatchObject({ success: false })
    expect(captureException).not.toHaveBeenCalled()
    vi.stubEnv('SENTRY_DSN', 'https://fixture@monitoring.example.test/1')
    vi.mocked(runCollectionsAutomation).mockResolvedValue(collectionResult)
    expect(await (await collectionsGet(request())).json()).toMatchObject({ success: true })
    expect(captureException).not.toHaveBeenCalled()
  })

  it('never calls engines or failure reporting for a paused schedule', async () => {
    vi.stubEnv('SCHEDULED_TASKS_ENABLED', 'false')
    expect((await remindersGet(request())).status).toBe(503)
    expect(runAppointmentReminders).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
  })
})

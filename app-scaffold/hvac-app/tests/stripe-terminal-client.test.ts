import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTerminal, normalizeTerminal } from '@/lib/stripe-terminal-client'

function sdk() {
  return {
    discoverReaders: vi.fn().mockResolvedValue({ discoveredReaders: [{ id: 'tmr_1', serial_number: 'SIM-1', device_type: 'stripe_s700' }] }),
    connectReader: vi.fn().mockResolvedValue({ reader: { id: 'tmr_1', serial_number: 'SIM-1' } }),
    disconnectReader: vi.fn().mockResolvedValue({}),
    collectPaymentMethod: vi.fn().mockResolvedValue({ paymentIntent: { id: 'pi_1', status: 'requires_confirmation' } }),
    cancelCollectPaymentMethod: vi.fn().mockResolvedValue({}),
    processPayment: vi.fn().mockResolvedValue({ paymentIntent: { id: 'pi_1', status: 'requires_capture' } }),
    clearReaderDisplay: vi.fn().mockResolvedValue({}),
    setReaderDisplay: vi.fn().mockResolvedValue({}),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('Stripe Terminal browser contract', () => {
  it.each(['error', 'load'] as const)('removes a failed SDK script and loads a new one on retry (%s)', async event => {
    vi.resetModules()
    const { createTerminal: load } = await import('@/lib/stripe-terminal-client')
    const scripts: Array<EventTarget & { src: string; async: boolean; remove: () => void }> = []
    const create = vi.fn().mockReturnValue(sdk())
    const browserWindow: { StripeTerminal?: { create: typeof create } } = {}
    vi.stubGlobal('window', browserWindow)
    vi.stubGlobal('document', {
      querySelector: () => scripts[0] ?? null,
      createElement: () => {
        const script = Object.assign(new EventTarget(), { src: '', async: false, remove: () => { scripts.splice(scripts.indexOf(script), 1) } })
        return script
      },
      head: { appendChild: (script: typeof scripts[number]) => scripts.push(script) },
    })
    const first = load({ onFetchConnectionToken: async () => 'test-token' })
    const failed = expect(first).rejects.toThrow(/Stripe Terminal SDK/)
    const original = scripts[0]
    original.dispatchEvent(new Event(event))
    await failed
    expect(scripts).toHaveLength(0)
    const second = load({ onFetchConnectionToken: async () => 'test-token' })
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).not.toBe(original)
    browserWindow.StripeTerminal = { create }
    scripts[0].dispatchEvent(new Event('load'))
    await expect(second).resolves.toBeDefined()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('returns a connection-token promise directly to Stripe and adapts status events', async () => {
    const create = vi.fn().mockReturnValue(sdk())
    vi.stubGlobal('window', { StripeTerminal: { create } })
    const status = vi.fn()
    await createTerminal({ onFetchConnectionToken: async () => 'test-token', onConnectionStatusChange: status })
    const options = create.mock.calls[0][0]
    await expect(options.onFetchConnectionToken()).resolves.toBe('test-token')
    options.onConnectionStatusChange({ status: 'connected' })
    expect(status).toHaveBeenCalledWith('connected')
  })

  it('preserves token-fetch failures as rejected promises', async () => {
    const create = vi.fn().mockReturnValue(sdk())
    vi.stubGlobal('window', { StripeTerminal: { create } })
    await createTerminal({ onFetchConnectionToken: async () => { throw new Error('Owner setup required') } })
    await expect(create.mock.calls[0][0].onFetchConnectionToken()).rejects.toThrow('Owner setup required')
  })

  it('maps actual reader field names and refuses to take over an in-use reader', async () => {
    const raw = sdk(), terminal = normalizeTerminal(raw)
    const discovery = await terminal.discoverReaders({ simulated: true })
    expect(raw.discoverReaders).toHaveBeenCalledWith({ simulated: true })
    expect(discovery.discoveredReaders[0]).toMatchObject({ serialNumber: 'SIM-1', deviceType: 'stripe_s700' })
    await terminal.connectReader(discovery.discoveredReaders[0])
    expect(raw.connectReader).toHaveBeenCalledWith(discovery.discoveredReaders[0], { fail_if_in_use: true })
  })

  it.each(['discoverReaders', 'connectReader', 'collectPaymentMethod', 'processPayment', 'cancelCollectPaymentMethod', 'disconnectReader'] as const)(
    'propagates a resolved %s error instead of reporting success', async (method) => {
      const raw = sdk()
      raw[method].mockResolvedValue({ error: { code: 'reader_error', message: 'Reader disconnected' } })
      const terminal = normalizeTerminal(raw)
      // Arguments do not affect this provider error; each method must reject it.
      await expect((terminal[method] as (...args: unknown[]) => Promise<unknown>)({})).rejects.toThrow('Reader disconnected')
    },
  )

  it.each(['collectPaymentMethod', 'processPayment'] as const)('rejects a missing %s payment result', async method => {
    const raw = sdk(); raw[method].mockResolvedValue({})
    const terminal = normalizeTerminal(raw)
    await expect((terminal[method] as (...args: unknown[]) => Promise<unknown>)({})).rejects.toThrow(/payment/)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createTerminalCollectionSession, type TerminalCollectionState, type TerminalIntentResult } from '@/lib/terminal-collection-session'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const paymentIntent = { id: 'pi_test', client_secret: 'test_secret', status: 'requires_capture' }
const reader = { id: 'reader_test', serialNumber: 'TEST' }
function fixture() {
  const sdk = {
    discoverReaders: vi.fn(async () => ({ discoveredReaders: [reader] })),
    connectReader: vi.fn(async () => ({ reader })), disconnectReader: vi.fn(async () => {}),
    collectPaymentMethod: vi.fn(async () => ({ paymentIntent })), cancelCollectPaymentMethod: vi.fn(async () => {}),
    processPayment: vi.fn(async () => ({ paymentIntent })), clearReaderDisplay: vi.fn(async () => {}), setReaderDisplay: vi.fn(async () => {}),
  }
  const states: TerminalCollectionState[] = []
  const deps = {
    createIntent: vi.fn(async (): Promise<TerminalIntentResult> => ({ success: true as const, paymentIntentId: paymentIntent.id, clientSecret: paymentIntent.client_secret })),
    createTerminal: vi.fn(async (_onDisconnect: () => void) => sdk),
    cancelAttempt: vi.fn(async (_id: string): Promise<{ success: true } | { success: false; error: string }> => ({ success: true })),
    capture: vi.fn(async (_id: string) => ({ success: true as const })),
    onState: vi.fn((state: TerminalCollectionState) => states.push(state)), onCaptured: vi.fn(),
  }
  return { sdk, deps, states, session: createTerminalCollectionSession(deps) }
}

describe('Terminal collection lifecycle', () => {
  it('serializes duplicate setup and collect clicks and only reports capture after the server confirms it', async () => {
    const f = fixture(), setup = deferred<Awaited<ReturnType<typeof f.deps.createIntent>>>(), capture = deferred<{ success: true }>()
    f.deps.createIntent.mockReturnValue(setup.promise)
    const starting = f.session.begin(false)
    await f.session.begin(false)
    expect(f.deps.createIntent).toHaveBeenCalledTimes(1)
    setup.resolve({ success: true, paymentIntentId: paymentIntent.id, clientSecret: paymentIntent.client_secret })
    await starting
    f.deps.capture.mockReturnValue(capture.promise)
    const collecting = f.session.collect()
    await f.session.collect()
    await vi.waitFor(() => expect(f.deps.capture).toHaveBeenCalledTimes(1))
    expect(f.states.at(-1)?.phase).toBe('capturing')
    expect(f.deps.onCaptured).not.toHaveBeenCalled()
    capture.resolve({ success: true })
    await collecting
    expect(f.states.at(-1)?.phase).toBe('success')
    expect(f.deps.onCaptured).toHaveBeenCalledTimes(1)
  })

  it('recovers a verified existing authorization without discovering or collecting another card', async () => {
    const f = fixture(), capture = deferred<{ success: true }>()
    f.deps.createIntent.mockResolvedValue({ success: true, paymentIntentId: paymentIntent.id, readyForCapture: true })
    f.deps.capture.mockReturnValue(capture.promise)
    const starting = f.session.begin(false)
    await vi.waitFor(() => expect(f.states.at(-1)?.phase).toBe('capturing'))
    await f.session.begin(false)
    await f.session.collect()
    await f.session.cancelCollection()
    expect(f.deps.createIntent).toHaveBeenCalledTimes(1)
    expect(f.deps.capture).toHaveBeenCalledExactlyOnceWith(paymentIntent.id)
    await f.session.cancelAttempt()
    expect(f.deps.cancelAttempt).not.toHaveBeenCalled()
    expect(f.states.at(-1)?.canCancelAttempt).toBe(false)
    expect(f.deps.createTerminal).not.toHaveBeenCalled()
    expect(f.sdk.collectPaymentMethod).not.toHaveBeenCalled()
    expect(f.deps.onCaptured).not.toHaveBeenCalled()
    capture.resolve({ success: true })
    await starting
    expect(f.states.at(-1)?.phase).toBe('success')
    expect(f.deps.onCaptured).toHaveBeenCalledTimes(1)
  })

  it('does not publish a late recovery result after unmount', async () => {
    const f = fixture(), capture = deferred<{ success: true }>()
    f.deps.createIntent.mockResolvedValue({ success: true, paymentIntentId: paymentIntent.id, readyForCapture: true })
    f.deps.capture.mockReturnValue(capture.promise)
    const starting = f.session.begin(false)
    await vi.waitFor(() => expect(f.deps.capture).toHaveBeenCalledTimes(1))
    f.session.dispose()
    const updates = f.deps.onState.mock.calls.length
    capture.resolve({ success: true })
    await starting
    expect(f.deps.onState).toHaveBeenCalledTimes(updates)
    expect(f.deps.onCaptured).not.toHaveBeenCalled()
  })

  it('explicitly cancels a known unprocessed attempt once and resets only after provider confirmation', async () => {
    const f = fixture(), canceled = deferred<{ success: true }>()
    await f.session.begin(false)
    expect(f.states.at(-1)?.canCancelAttempt).toBe(true)
    f.deps.cancelAttempt.mockReturnValue(canceled.promise)
    const canceling = f.session.cancelAttempt()
    await f.session.cancelAttempt()
    await f.session.collect()
    expect(f.states.at(-1)?.phase).toBe('canceling_attempt')
    expect(f.deps.cancelAttempt).toHaveBeenCalledExactlyOnceWith(paymentIntent.id)
    expect(f.sdk.collectPaymentMethod).not.toHaveBeenCalled()
    canceled.resolve({ success: true })
    await canceling
    expect(f.states.at(-1)).toMatchObject({ phase: 'idle', canCancelAttempt: false })
    expect(f.sdk.disconnectReader).toHaveBeenCalledTimes(1)
  })

  it('keeps unknown cancellation outcomes blocked instead of allowing another method', async () => {
    const f = fixture()
    await f.session.begin(false)
    f.deps.cancelAttempt.mockResolvedValue({ success: false, error: 'Payment outcome is unknown' })
    await f.session.cancelAttempt()
    expect(f.states.at(-1)).toMatchObject({ phase: 'error', canCancelAttempt: false, message: 'Payment outcome is unknown' })
    expect(f.sdk.disconnectReader).not.toHaveBeenCalled()
  })

  it.each(['collected', 'recovered'] as const)('does not cancel after an uncertain %s capture', async mode => {
    const f = fixture()
    if (mode === 'recovered') f.deps.createIntent.mockResolvedValue({ success: true, paymentIntentId: paymentIntent.id, readyForCapture: true })
    f.deps.capture.mockRejectedValue(new Error('Capture response lost'))
    await f.session.begin(false)
    if (mode === 'collected') await f.session.collect()
    expect(f.states.at(-1)).toMatchObject({ phase: 'error', canCancelAttempt: false })
    await f.session.cancelAttempt()
    expect(f.deps.cancelAttempt).not.toHaveBeenCalled()
  })

  it('allows explicit cancellation after discovery failure while retaining the known payment ID', async () => {
    const f = fixture()
    f.sdk.discoverReaders.mockRejectedValue(new Error('Reader unavailable'))
    await f.session.begin(false)
    expect(f.states.at(-1)).toMatchObject({ phase: 'error', canCancelAttempt: true })
    await f.session.cancelAttempt()
    expect(f.deps.cancelAttempt).toHaveBeenCalledExactlyOnceWith(paymentIntent.id)
    expect(f.states.at(-1)?.phase).toBe('idle')
  })

  it.each(['reset', 'dispose'] as const)('never cancels a payment attempt automatically on %s', async operation => {
    const f = fixture()
    await f.session.begin(false)
    await f.session[operation]()
    expect(f.deps.cancelAttempt).not.toHaveBeenCalled()
  })

  it('does not offer or perform collection cancellation once processing has started', async () => {
    const f = fixture(), processing = deferred<{ paymentIntent: typeof paymentIntent }>()
    await f.session.begin(false)
    f.sdk.processPayment.mockReturnValue(processing.promise)
    const collecting = f.session.collect()
    await vi.waitFor(() => expect(f.states.at(-1)?.phase).toBe('processing'))
    await f.session.cancelCollection()
    await f.session.cancelAttempt()
    expect(f.deps.cancelAttempt).not.toHaveBeenCalled()
    expect(f.states.at(-1)?.canCancelAttempt).toBe(false)
    await f.session.reset()
    expect(f.sdk.cancelCollectPaymentMethod).not.toHaveBeenCalled()
    expect(f.states.at(-1)?.phase).toBe('processing')
    processing.resolve({ paymentIntent })
    await collecting
    expect(f.deps.capture).toHaveBeenCalledExactlyOnceWith(paymentIntent.id)
  })

  it('prevents a late collection result from processing after cancellation was requested', async () => {
    const f = fixture(), collection = deferred<{ paymentIntent: typeof paymentIntent }>(), canceled = deferred<void>()
    await f.session.begin(false)
    f.sdk.collectPaymentMethod.mockReturnValue(collection.promise)
    f.sdk.cancelCollectPaymentMethod.mockReturnValue(canceled.promise)
    const collecting = f.session.collect()
    const canceling = f.session.cancelCollection()
    await f.session.cancelCollection()
    collection.resolve({ paymentIntent })
    await collecting
    expect(f.states.at(-1)?.phase).toBe('canceling')
    expect(f.sdk.processPayment).not.toHaveBeenCalled()
    expect(f.sdk.cancelCollectPaymentMethod).toHaveBeenCalledTimes(1)
    canceled.resolve()
    await canceling
    expect(f.states.at(-1)?.phase).toBe('ready')
  })

  it('leaves an uncertain cancellation in error without processing the late card result', async () => {
    const f = fixture(), collection = deferred<{ paymentIntent: typeof paymentIntent }>()
    await f.session.begin(false)
    f.sdk.collectPaymentMethod.mockReturnValue(collection.promise)
    f.sdk.cancelCollectPaymentMethod.mockRejectedValue(new Error('Network lost'))
    const collecting = f.session.collect()
    await f.session.cancelCollection()
    collection.resolve({ paymentIntent })
    await collecting
    expect(f.states.at(-1)).toMatchObject({ phase: 'error', message: expect.stringContaining('Cancellation could not be confirmed') })
    expect(f.sdk.processPayment).not.toHaveBeenCalled()
    expect(f.deps.capture).not.toHaveBeenCalled()
  })

  it('does not initialize or discover a reader after unmount while server setup is pending', async () => {
    const f = fixture(), setup = deferred<Awaited<ReturnType<typeof f.deps.createIntent>>>()
    f.deps.createIntent.mockReturnValue(setup.promise)
    const starting = f.session.begin(false)
    f.session.dispose()
    const updates = f.deps.onState.mock.calls.length
    setup.resolve({ success: true, paymentIntentId: paymentIntent.id, clientSecret: paymentIntent.client_secret })
    await starting
    expect(f.deps.createTerminal).not.toHaveBeenCalled()
    expect(f.deps.onState).toHaveBeenCalledTimes(updates)
  })

  it('disconnects a reader that finishes connecting after unmount', async () => {
    const f = fixture(), connecting = deferred<{ reader: typeof reader }>()
    f.sdk.connectReader.mockReturnValue(connecting.promise)
    const starting = f.session.begin(false)
    await vi.waitFor(() => expect(f.states.at(-1)?.phase).toBe('connecting'))
    f.session.dispose()
    const updates = f.deps.onState.mock.calls.length
    connecting.resolve({ reader })
    await starting
    expect(f.sdk.disconnectReader).toHaveBeenCalledTimes(2)
    expect(f.deps.onState).toHaveBeenCalledTimes(updates)
  })

  it.each(['dispose', 'disconnect'] as const)('does not capture after %s while processing is pending', async interruption => {
    const f = fixture(), processing = deferred<{ paymentIntent: typeof paymentIntent }>()
    await f.session.begin(false)
    f.sdk.processPayment.mockReturnValue(processing.promise)
    const collecting = f.session.collect()
    await vi.waitFor(() => expect(f.states.at(-1)?.phase).toBe('processing'))
    if (interruption === 'dispose') f.session.dispose()
    else f.deps.createTerminal.mock.calls[0][0]()
    processing.resolve({ paymentIntent })
    await collecting
    expect(f.deps.capture).not.toHaveBeenCalled()
    expect(f.deps.onCaptured).not.toHaveBeenCalled()
  })

  it('ignores callbacks from a previous reader session after reset', async () => {
    const f = fixture()
    await f.session.begin(false)
    const oldDisconnect = f.deps.createTerminal.mock.calls[0][0]
    await f.session.reset()
    await f.session.begin(false)
    oldDisconnect()
    expect(f.states.at(-1)?.phase).toBe('ready')
  })

  it('does not capture a payment ID that differs from the active invoice attempt', async () => {
    const f = fixture()
    await f.session.begin(false)
    f.sdk.processPayment.mockResolvedValue({ paymentIntent: { ...paymentIntent, id: 'pi_other' } })
    await f.session.collect()
    expect(f.deps.capture).not.toHaveBeenCalled()
    expect(f.states.at(-1)).toMatchObject({ phase: 'error', message: expect.stringContaining('different payment') })
  })
})

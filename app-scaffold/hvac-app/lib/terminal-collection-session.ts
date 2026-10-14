import type { TerminalReader, TerminalSDK } from '@/lib/stripe-terminal-client'

export type TerminalPhase = 'idle' | 'disconnecting' | 'initializing' | 'discovering' | 'select_reader' | 'connecting' | 'ready' | 'collecting' | 'canceling' | 'canceling_attempt' | 'processing' | 'capturing' | 'success' | 'error'
export type TerminalCollectionState = { phase: TerminalPhase; message: string | null; readers: TerminalReader[]; canCancelAttempt: boolean }
export const initialTerminalCollectionState: TerminalCollectionState = { phase: 'idle', message: null, readers: [], canCancelAttempt: false }

export type TerminalIntentResult =
  | { success: true; paymentIntentId: string; clientSecret: string; readyForCapture?: false }
  | { success: true; paymentIntentId: string; readyForCapture: true }
  | { success: false; error: string }

type Dependencies = {
  createIntent: () => Promise<TerminalIntentResult>
  createTerminal: (onDisconnect: () => void) => Promise<TerminalSDK>
  cancelAttempt: (id: string) => Promise<{ success: true } | { success: false; error: string }>
  capture: (id: string) => Promise<{ success: true } | { success: false; error: string }>
  onState: (state: TerminalCollectionState) => void
  onCaptured: () => void
}

/** One UI collection session. Phase changes synchronously guard every command,
 * and generations prevent late SDK results from continuing an abandoned flow. */
export function createTerminalCollectionSession(deps: Dependencies) {
  let state = { ...initialTerminalCollectionState }
  let terminal: TerminalSDK | null = null
  let intent: { id: string; clientSecret: string } | null = null
  let paymentIntentId: string | null = null
  let generation = 0
  let readerGeneration = 0
  let disposed = false
  const current = (operation: number) => !disposed && generation === operation
  const update = (patch: Partial<TerminalCollectionState>) => {
    if (disposed) return
    state = { ...state, ...patch }
    deps.onState(state)
  }
  const fail = (error: unknown, fallback: string) => update({ phase: 'error', message: error instanceof Error ? error.message : fallback })
  const quietlyDisconnect = async (reader: TerminalSDK) => { try { await reader.disconnectReader() } catch { /* No stale UI updates. */ } }

  const connect = async (reader: TerminalReader, operation: number) => {
    const sdk = terminal
    if (!current(operation) || !sdk) return
    update({ phase: 'connecting', message: null })
    try {
      await sdk.connectReader(reader)
      if (!current(operation)) { await quietlyDisconnect(sdk); return }
      update({ phase: 'ready' })
    } catch (error) {
      if (current(operation)) fail(error, 'Failed to connect to reader.')
    }
  }

  return {
    async begin(simulated: boolean) {
      if (disposed || !['idle', 'select_reader'].includes(state.phase)) return
      const operation = ++generation
      const readerOperation = ++readerGeneration
      update({ phase: 'initializing', message: null, readers: [], canCancelAttempt: false })
      try {
        if (terminal) await terminal.disconnectReader()
        if (!current(operation)) return
        terminal = null
        const result = await deps.createIntent()
        if (!current(operation)) return
        if (!result.success) { update({ phase: 'error', message: result.error }); return }
        paymentIntentId = result.paymentIntentId
        if (result.readyForCapture) {
          // The server matched the existing authorization to this invoice.
          // Recover its capture; never ask for another card or create a charge.
          update({ phase: 'capturing' })
          const capture = await deps.capture(result.paymentIntentId)
          if (!current(operation)) return
          if (!capture.success) { update({ phase: 'error', message: capture.error }); return }
          update({ phase: 'success' })
          deps.onCaptured()
          return
        }
        intent = { id: result.paymentIntentId, clientSecret: result.clientSecret }
        update({ canCancelAttempt: true })
        const sdk = await deps.createTerminal(() => {
          if (disposed || readerOperation !== readerGeneration) return
          generation += 1
          update({ phase: 'error', readers: [], message: 'Reader disconnected unexpectedly. Check the invoice before starting again.' })
        })
        if (!current(operation)) { await quietlyDisconnect(sdk); return }
        terminal = sdk
        update({ phase: 'discovering' })
        const resultReaders = await sdk.discoverReaders({ simulated })
        if (!current(operation)) return
        update({ readers: resultReaders.discoveredReaders })
        if (resultReaders.discoveredReaders.length === 1) await connect(resultReaders.discoveredReaders[0], operation)
        else update({ phase: 'select_reader', message: resultReaders.discoveredReaders.length === 0 ? 'No readers found. Make sure the reader is registered, powered on, and connected to the same network.' : null })
      } catch (error) {
        if (current(operation)) fail(error, 'Payment setup could not be confirmed. Check the invoice before trying again.')
      }
    },

    async connectReader(reader: TerminalReader) {
      if (disposed || state.phase !== 'select_reader') return
      await connect(reader, ++generation)
    },

    async collect() {
      if (disposed || state.phase !== 'ready' || !terminal || !intent) return
      const operation = ++generation
      const sdk = terminal, activeIntent = intent
      update({ phase: 'collecting', message: null })
      try {
        const collected = await sdk.collectPaymentMethod(activeIntent.clientSecret)
        if (!current(operation)) return
        if (collected.paymentIntent.id !== activeIntent.id) throw new Error('The reader returned a different payment. Check the invoice before starting again.')
        // Collection is complete: its cancel command must no longer be exposed.
        update({ phase: 'processing', canCancelAttempt: false })
        const processed = await sdk.processPayment(collected.paymentIntent)
        if (!current(operation)) return
        if (processed.paymentIntent.id !== activeIntent.id) throw new Error('The reader returned a different payment. Check the invoice before starting again.')
        update({ phase: 'capturing' })
        const capture = await deps.capture(activeIntent.id)
        if (!current(operation)) return
        if (!capture.success) { update({ phase: 'error', message: capture.error }); return }
        update({ phase: 'success' })
        deps.onCaptured()
      } catch (error) {
        if (current(operation)) fail(error, 'Payment collection could not be confirmed. Check the invoice before trying again.')
      }
    },

    async cancelCollection() {
      if (disposed || state.phase !== 'collecting' || !terminal) return
      const operation = ++generation
      update({ phase: 'canceling' })
      try {
        await terminal.cancelCollectPaymentMethod()
        if (current(operation)) update({ phase: 'ready', message: null })
      } catch {
        if (current(operation)) update({ phase: 'error', message: 'Cancellation could not be confirmed. Check the reader and invoice before trying again.' })
      }
    },

    async cancelAttempt() {
      if (disposed || !state.canCancelAttempt || !paymentIntentId || !['ready', 'select_reader', 'error'].includes(state.phase)) return
      const operation = ++generation
      readerGeneration += 1
      update({ phase: 'canceling_attempt', message: null, canCancelAttempt: false })
      try {
        const canceled = await deps.cancelAttempt(paymentIntentId)
        if (!current(operation)) return
        if (!canceled.success) { update({ phase: 'error', message: canceled.error }); return }
        if (terminal) await quietlyDisconnect(terminal)
        if (!current(operation)) return
        terminal = null
        intent = null
        paymentIntentId = null
        update({ ...initialTerminalCollectionState })
      } catch {
        if (current(operation)) update({ phase: 'error', message: 'Payment cancellation could not be confirmed. Check the invoice before starting another payment method.' })
      }
    },

    async reset() {
      if (disposed || !['ready', 'select_reader', 'error', 'success'].includes(state.phase)) return
      const operation = ++generation
      readerGeneration += 1
      update({ phase: 'disconnecting' })
      try {
        await terminal?.disconnectReader()
        if (!current(operation)) return
        terminal = null
        intent = null
        paymentIntentId = null
        update({ ...initialTerminalCollectionState })
      } catch {
        if (current(operation)) update({ phase: 'error', message: 'The reader could not disconnect. Check its connection before starting again.' })
      }
    },

    dispose() {
      if (disposed) return
      disposed = true
      generation += 1
      readerGeneration += 1
      const sdk = terminal
      terminal = null
      if (sdk) {
        if (state.phase === 'collecting') void sdk.cancelCollectPaymentMethod().catch(() => {})
        void quietlyDisconnect(sdk)
      }
    },
  }
}

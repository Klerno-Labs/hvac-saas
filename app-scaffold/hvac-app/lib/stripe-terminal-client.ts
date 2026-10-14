/**
 * Browser-only loader for the Stripe Terminal JS SDK.
 *
 * The SDK is injected via the official script tag (https://js.stripe.com/terminal/v1)
 * rather than the npm package to avoid SSR/global-patching issues under Next.js.
 * Only the subset of the API used by the in-field collection flow is typed here.
 *
 * NOTE: Stripe Terminal "tap to pay on phone" (phone-as-reader) is exclusive to
 * the native iOS/Android SDKs. This web integration drives a registered internet-connected smart
 * reader. A native mobile client may reuse the same server contract
 * (connection token / PaymentIntent / capture endpoints).
 */

const TERMINAL_SCRIPT_URL = 'https://js.stripe.com/terminal/v1'

export type TerminalConnectionStatus =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'interrupted'

export interface TerminalReader {
  id: string
  serialNumber: string
  label?: string
  deviceType?: string
  status?: string
}

export interface TerminalPaymentIntent {
  id: string
  client_secret: string
  status: string
}

export interface TerminalSDK {
  discoverReaders(opts: {
    simulated?: boolean
    location?: string
  }): Promise<{ discoveredReaders: TerminalReader[] }>
  connectReader(reader: TerminalReader): Promise<{ reader: TerminalReader }>
  disconnectReader(): Promise<void>
  collectPaymentMethod(clientSecret: string): Promise<{ paymentIntent: TerminalPaymentIntent }>
  cancelCollectPaymentMethod(): Promise<void>
  processPayment(paymentIntent: TerminalPaymentIntent): Promise<{ paymentIntent: TerminalPaymentIntent }>
  clearReaderDisplay(): Promise<void>
  setReaderDisplay(opts: { type: 'cart'; cart: { lineItems: unknown[]; tax: number; total: number; currency: string } }): Promise<void>
}

type TerminalError = { message: string; code?: string }
type SDKResult<T> = T & { error?: TerminalError }
type RawReader = TerminalReader & { serial_number?: string; device_type?: string }

interface RawTerminalSDK {
  discoverReaders(opts: { simulated?: boolean; location?: string }): Promise<SDKResult<{ discoveredReaders?: RawReader[] }>>
  connectReader(reader: TerminalReader, options?: { fail_if_in_use: boolean }): Promise<SDKResult<{ reader?: RawReader }>>
  disconnectReader(): Promise<SDKResult<object>>
  collectPaymentMethod(secret: string): Promise<SDKResult<{ paymentIntent?: TerminalPaymentIntent }>>
  cancelCollectPaymentMethod(): Promise<SDKResult<object>>
  processPayment(intent: TerminalPaymentIntent): Promise<SDKResult<{ paymentIntent?: TerminalPaymentIntent }>>
  clearReaderDisplay(): Promise<SDKResult<object>>
  setReaderDisplay(opts: unknown): Promise<SDKResult<object>>
}

function checked<T>(result: SDKResult<T>): T {
  if (result.error) throw new Error(result.error.message || 'The card reader could not complete this step.')
  return result
}

function readerLabel(reader: RawReader): TerminalReader {
  return { ...reader, serialNumber: reader.serial_number ?? reader.serialNumber, deviceType: reader.device_type ?? reader.deviceType }
}

/** Stripe resolves command errors in result.error rather than rejecting promises. */
export function normalizeTerminal(raw: RawTerminalSDK): TerminalSDK {
  return {
    async discoverReaders(opts) {
      const result = checked(await raw.discoverReaders(opts))
      return { discoveredReaders: (result.discoveredReaders ?? []).map(readerLabel) }
    },
    async connectReader(reader) {
      const result = checked(await raw.connectReader(reader, { fail_if_in_use: true }))
      if (!result.reader) throw new Error('The card reader did not confirm its connection.')
      return { reader: readerLabel(result.reader) }
    },
    async disconnectReader() { checked(await raw.disconnectReader()) },
    async collectPaymentMethod(secret) {
      const result = checked(await raw.collectPaymentMethod(secret))
      if (!result.paymentIntent) throw new Error('The card reader did not return a payment.')
      return { paymentIntent: result.paymentIntent }
    },
    async cancelCollectPaymentMethod() { checked(await raw.cancelCollectPaymentMethod()) },
    async processPayment(intent) {
      const result = checked(await raw.processPayment(intent))
      if (!result.paymentIntent) throw new Error('The card reader did not confirm payment processing.')
      return { paymentIntent: result.paymentIntent }
    },
    async clearReaderDisplay() { checked(await raw.clearReaderDisplay()) },
    async setReaderDisplay({ type, cart }) {
      const { lineItems, ...rest } = cart
      checked(await raw.setReaderDisplay({ type, cart: { ...rest, line_items: lineItems } }))
    },
  }
}

interface StripeTerminalStatic {
  create(opts: {
    onFetchConnectionToken: () => Promise<string>
    onUnexpectedReaderDisconnect?: () => void
    onConnectionStatusChange?: (event: { status: TerminalConnectionStatus }) => void
  }): RawTerminalSDK
}

declare global {
  interface Window {
    StripeTerminal?: StripeTerminalStatic
  }
}

let scriptPromise: Promise<StripeTerminalStatic> | null = null

function loadStripeTerminal(): Promise<StripeTerminalStatic> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Stripe Terminal can only be used in the browser'))
  }

  if (window.StripeTerminal) {
    return Promise.resolve(window.StripeTerminal)
  }

  if (scriptPromise) return scriptPromise

  const loading = new Promise<StripeTerminalStatic>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TERMINAL_SCRIPT_URL}"]`,
    )

    const script = existing ?? document.createElement('script')
    const cleanup = () => {
      script.removeEventListener('load', onLoad)
      script.removeEventListener('error', onError)
    }
    const failed = (message: string) => {
      cleanup()
      // A failed script never emits another load event. Remove it so the next
      // attempt can start a fresh request instead of waiting on a dead element.
      script.remove()
      reject(new Error(message))
    }
    const onLoad = () => {
      if (window.StripeTerminal) {
        cleanup()
        resolve(window.StripeTerminal)
      } else {
        failed('Stripe Terminal SDK loaded but StripeTerminal was not found on window')
      }
    }
    const onError = () => failed('Failed to load Stripe Terminal SDK')

    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)
    if (!existing) {
      script.src = TERMINAL_SCRIPT_URL
      script.async = true
      document.head.appendChild(script)
    }
  })

  scriptPromise = loading
  void loading.catch(() => {
    if (scriptPromise === loading) scriptPromise = null
  })
  return loading
}

export async function createTerminal(opts: {
  onFetchConnectionToken: () => Promise<string>
  onUnexpectedReaderDisconnect?: () => void
  onConnectionStatusChange?: (status: TerminalConnectionStatus) => void
}): Promise<TerminalSDK> {
  const StripeTerminal = await loadStripeTerminal()
  return normalizeTerminal(StripeTerminal.create({
    onFetchConnectionToken: opts.onFetchConnectionToken,
    onUnexpectedReaderDisconnect: opts.onUnexpectedReaderDisconnect,
    onConnectionStatusChange: event => opts.onConnectionStatusChange?.(event.status),
  }))
}

/**
 * Browser-only loader for the Stripe Terminal JS SDK.
 *
 * The SDK is injected via the official script tag (https://js.stripe.com/terminal/v1)
 * rather than the npm package to avoid SSR/global-patching issues under Next.js.
 * Only the subset of the API used by the in-field collection flow is typed here.
 *
 * NOTE: Stripe Terminal "tap to pay on phone" (phone-as-reader) is exclusive to
 * the native iOS/Android SDKs. This web integration drives a Bluetooth/USB card
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
  setConnectionStatus(status: TerminalConnectionStatus): void
  discoverReaders(opts: {
    type: 'bluetooth_scan' | 'internet' | 'usb'
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

type ConnectionTokenCallback = (error: string | null, secret?: string) => void

interface StripeTerminalStatic {
  create(opts: {
    onFetchConnectionToken: (cb: ConnectionTokenCallback) => void
    onUnexpectedReaderDisconnect?: () => void
    onConnectionStatusChange?: (status: TerminalConnectionStatus) => void
  }): TerminalSDK
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

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TERMINAL_SCRIPT_URL}"]`,
    )

    const onLoad = () => {
      if (window.StripeTerminal) {
        resolve(window.StripeTerminal)
      } else {
        reject(new Error('Stripe Terminal SDK loaded but StripeTerminal was not found on window'))
      }
    }

    if (existing) {
      if (window.StripeTerminal) {
        resolve(window.StripeTerminal)
        return
      }
      existing.addEventListener('load', onLoad)
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Stripe Terminal SDK')),
      )
      return
    }

    const script = document.createElement('script')
    script.src = TERMINAL_SCRIPT_URL
    script.async = true
    script.addEventListener('load', onLoad)
    script.addEventListener('error', () =>
      reject(new Error('Failed to load Stripe Terminal SDK')),
    )
    document.head.appendChild(script)
  })

  return scriptPromise
}

export async function createTerminal(opts: {
  onFetchConnectionToken: () => Promise<string>
  onUnexpectedReaderDisconnect?: () => void
  onConnectionStatusChange?: (status: TerminalConnectionStatus) => void
}): Promise<TerminalSDK> {
  const StripeTerminal = await loadStripeTerminal()
  return StripeTerminal.create({
    onFetchConnectionToken: (cb) => {
      opts
        .onFetchConnectionToken()
        .then((secret) => cb(null, secret))
        .catch((err) => cb(err instanceof Error ? err.message : 'Failed to fetch connection token'))
    },
    onUnexpectedReaderDisconnect: opts.onUnexpectedReaderDisconnect,
    onConnectionStatusChange: opts.onConnectionStatusChange,
  })
}

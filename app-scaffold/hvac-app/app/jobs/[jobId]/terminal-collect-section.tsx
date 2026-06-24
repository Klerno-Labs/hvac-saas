'use client'

import { useCallback, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  createTerminalConnectionToken,
  createTerminalPaymentIntent,
  captureTerminalPayment,
} from './terminal-payment-actions'
import {
  createTerminal,
  type TerminalSDK,
  type TerminalReader,
  type TerminalConnectionStatus,
} from '@/lib/stripe-terminal-client'

type CollectableInvoice = {
  id: string
  invoiceNumber: string
  totalCents: number
  outstandingCents: number
  status: string
}

type Phase =
  | 'idle'
  | 'initializing'
  | 'discovering'
  | 'select_reader'
  | 'connecting'
  | 'ready'
  | 'collecting'
  | 'capturing'
  | 'success'
  | 'error'

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

export function TerminalCollectSection({
  eligible,
  ineligibleReason,
  invoices,
}: {
  eligible: boolean
  ineligibleReason?: string
  invoices: CollectableInvoice[]
}) {
  const collectable = invoices.filter(
    (inv) => inv.status !== 'paid' && inv.status !== 'void' && inv.status !== 'draft' && inv.totalCents > 0,
  )

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          In-field card payment
          <Badge variant={eligible ? 'default' : 'secondary'}>
            {eligible ? 'Stripe Terminal' : 'Not available'}
          </Badge>
        </CardTitle>
        <CardDescription>
          Collect a tap-to-pay card payment on a Stripe Terminal reader. The invoice is marked paid once capture is confirmed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!eligible && (
          <p className="text-sm text-amber-600">
            {ineligibleReason ?? 'Stripe Terminal is not available for this organization.'}
          </p>
        )}

        {collectable.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices are ready to collect right now.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {collectable.map((inv) => (
              <li key={inv.id} className="p-3">
                <CollectRow invoice={inv} eligible={eligible} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function CollectRow({ invoice, eligible }: { invoice: CollectableInvoice; eligible: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [readers, setReaders] = useState<TerminalReader[]>([])
  const [simulated, setSimulated] = useState(false)
  const terminalRef = useRef<TerminalSDK | null>(null)
  const activeIntentRef = useRef<{ id: string; clientSecret: string } | null>(null)

  const reset = useCallback(() => {
    terminalRef.current = null
    activeIntentRef.current = null
    setReaders([])
    setMessage(null)
    setPhase('idle')
  }, [])

  const begin = useCallback(async () => {
    setMessage(null)
    setPhase('initializing')

    const intent = await createTerminalPaymentIntent(invoice.id)
    if (!intent.success) {
      setMessage(intent.error)
      setPhase('error')
      return
    }
    activeIntentRef.current = { id: intent.paymentIntentId, clientSecret: intent.clientSecret }

    try {
      const terminal = await createTerminal({
        onFetchConnectionToken: async () => {
          const token = await createTerminalConnectionToken()
          if (!token.success) throw new Error(token.error)
          return token.secret
        },
        onUnexpectedReaderDisconnect: () => {
          setMessage('Reader disconnected unexpectedly. Reconnect to continue.')
          setPhase('select_reader')
        },
      })
      terminalRef.current = terminal
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to initialise Stripe Terminal.')
      setPhase('error')
      return
    }

    setPhase('discovering')
    try {
      const result = await terminalRef.current!.discoverReaders({
        type: 'bluetooth_scan',
        simulated,
      })
      setReaders(result.discoveredReaders || [])
      if (result.discoveredReaders.length === 0) {
        setMessage('No readers found. Make sure the reader is powered on and nearby, or enable the simulated reader.')
        setPhase('select_reader')
      } else if (result.discoveredReaders.length === 1) {
        await connectReader(result.discoveredReaders[0])
      } else {
        setPhase('select_reader')
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Reader discovery failed.')
      setPhase('error')
    }
  }, [invoice.id, simulated])

  const connectReader = useCallback(async (reader: TerminalReader) => {
    setPhase('connecting')
    setMessage(null)
    try {
      await terminalRef.current?.connectReader(reader)
      setPhase('ready')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to connect to reader.')
      setPhase('error')
    }
  }, [])

  const collect = useCallback(async () => {
    const terminal = terminalRef.current
    const intent = activeIntentRef.current
    if (!terminal || !intent) {
      setMessage('Session expired. Start again.')
      setPhase('error')
      return
    }

    setPhase('collecting')
    setMessage(null)
    try {
      const collected = await terminal.collectPaymentMethod(intent.clientSecret)
      const processed = await terminal.processPayment(collected.paymentIntent)

      setPhase('capturing')
      const capture = await captureTerminalPayment(processed.paymentIntent.id)
      if (!capture.success) {
        setMessage(capture.error)
        setPhase('error')
        return
      }
      setPhase('success')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Payment collection failed.')
      setPhase('error')
    }
  }, [])

  const cancelCollection = useCallback(async () => {
    try {
      await terminalRef.current?.cancelCollectPaymentMethod()
    } catch {
      // ignore cancel errors
    }
    setPhase('ready')
  }, [])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Invoice #{invoice.invoiceNumber}</p>
          <p className="text-xs text-muted-foreground">
            Outstanding {formatCents(invoice.outstandingCents > 0 ? invoice.outstandingCents : invoice.totalCents)}
            {' '}· <span className="capitalize">{invoice.status}</span>
          </p>
        </div>

        {phase === 'idle' && (
          <Button size="sm" onClick={begin} disabled={!eligible}>
            Collect payment
          </Button>
        )}
        {phase === 'success' && (
          <Badge variant="default">Paid</Badge>
        )}
        {(phase === 'error' || phase === 'success') && (
          <Button size="sm" variant="outline" onClick={reset}>
            Done
          </Button>
        )}
      </div>

      {phase === 'idle' && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={simulated}
            onChange={(e) => setSimulated(e.target.checked)}
            disabled={!eligible}
          />
          Use simulated reader (testing)
        </label>
      )}

      {phase !== 'idle' && phase !== 'success' && phase !== 'error' && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
          <PhaseStatus phase={phase} />
          {phase === 'select_reader' && (
            <div className="space-y-2">
              {readers.length === 0 ? (
                <Button size="sm" variant="outline" onClick={() => begin()}>
                  Retry discovery
                </Button>
              ) : (
                <ul className="space-y-1">
                  {readers.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span className="text-xs">
                        {r.label || r.deviceType || 'Reader'}{' '}
                        <span className="text-muted-foreground">({r.serialNumber})</span>
                      </span>
                      <Button size="xs" variant="outline" onClick={() => connectReader(r)}>
                        Connect
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Button size="xs" variant="ghost" onClick={reset}>
                Cancel
              </Button>
            </div>
          )}
          {phase === 'ready' && (
            <div className="flex gap-2">
              <Button size="sm" onClick={collect}>Present card &amp; collect</Button>
              <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
            </div>
          )}
          {phase === 'collecting' && (
            <Button size="sm" variant="ghost" onClick={cancelCollection}>Cancel tap</Button>
          )}
        </div>
      )}

      {phase === 'success' && (
        <p className="text-sm text-emerald-600">Payment captured and invoice marked paid.</p>
      )}

      {message && phase === 'error' && (
        <p className="text-sm text-destructive">{message}</p>
      )}
    </div>
  )
}

function PhaseStatus({ phase }: { phase: Phase }) {
  const labels: Partial<Record<Phase, string>> = {
    initializing: 'Initialising Stripe Terminal…',
    discovering: 'Searching for readers…',
    select_reader: 'Select a reader:',
    connecting: 'Connecting to reader…',
    ready: 'Reader connected. Ask the customer to tap, insert, or swipe.',
    collecting: 'Waiting for card tap…',
    capturing: 'Capturing payment…',
  }
  return <p className="font-medium">{labels[phase] ?? phase}</p>
}

export type { TerminalConnectionStatus }

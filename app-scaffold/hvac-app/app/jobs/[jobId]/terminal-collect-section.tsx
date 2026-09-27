'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  createTerminalConnectionToken,
  createTerminalPaymentIntent,
  captureTerminalPayment,
  cancelTerminalPaymentAttempt,
} from './terminal-payment-actions'
import { createTerminal, type TerminalConnectionStatus } from '@/lib/stripe-terminal-client'
import { createTerminalCollectionSession, initialTerminalCollectionState, type TerminalPhase as Phase } from '@/lib/terminal-collection-session'

type CollectableInvoice = {
  id: string
  invoiceNumber: string
  totalCents: number
  outstandingCents: number
  status: string
}

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

export function TerminalCollectSection({
  eligible,
  ineligibleReason,
  invoices,
  allowSimulation = false,
}: {
  eligible: boolean
  ineligibleReason?: string
  invoices: CollectableInvoice[]
  allowSimulation?: boolean
}) {
  const collectable = invoices.filter(
    (inv) => inv.status !== 'paid' && inv.status !== 'void' && inv.status !== 'draft' && inv.outstandingCents > 0,
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
          Collect a tap-to-pay card payment on a registered Stripe Terminal smart reader on the same network. The invoice updates when Stripe confirms the payment.
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
                <CollectRow invoice={inv} eligible={eligible} allowSimulation={allowSimulation} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function CollectRow({ invoice, eligible, allowSimulation }: { invoice: CollectableInvoice; eligible: boolean; allowSimulation: boolean }) {
  const router = useRouter()
  const [state, setState] = useState(initialTerminalCollectionState)
  const { phase, message, readers, canCancelAttempt } = state
  const [simulated, setSimulated] = useState(false)
  const sessionRef = useRef<ReturnType<typeof createTerminalCollectionSession> | null>(null)

  useEffect(() => {
    const session = createTerminalCollectionSession({
      createIntent: () => createTerminalPaymentIntent(invoice.id),
      createTerminal: onUnexpectedReaderDisconnect => createTerminal({
        onFetchConnectionToken: async () => {
          const token = await createTerminalConnectionToken()
          if (!token.success) throw new Error(token.error)
          return token.secret
        },
        onUnexpectedReaderDisconnect,
      }),
      capture: captureTerminalPayment,
      cancelAttempt: cancelTerminalPaymentAttempt,
      onState: setState,
      onCaptured: () => router.refresh(),
    })
    sessionRef.current = session
    setState(initialTerminalCollectionState)
    return () => { session.dispose(); sessionRef.current = null }
  }, [invoice.id, router])

  const begin = () => sessionRef.current?.begin(allowSimulation && simulated)
  const reset = () => sessionRef.current?.reset()
  const collect = () => sessionRef.current?.collect()
  const cancelCollection = () => sessionRef.current?.cancelCollection()

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Invoice #{invoice.invoiceNumber}</p>
          <p className="text-xs text-muted-foreground">
            Outstanding {formatCents(invoice.outstandingCents)}
            {' '}· <span className="capitalize">{invoice.status}</span>
          </p>
        </div>

        {phase === 'idle' && (
          <Button size="sm" onClick={begin} disabled={!eligible}>
            Collect payment
          </Button>
        )}
        {phase === 'success' && (
          <Badge variant="secondary">Awaiting invoice confirmation</Badge>
        )}
        {(phase === 'error' || phase === 'success') && (
          <Button size="sm" variant="outline" onClick={reset}>
            Done
          </Button>
        )}
      </div>

      {phase === 'idle' && allowSimulation && (
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
                      <Button size="xs" variant="outline" onClick={() => sessionRef.current?.connectReader(r)}>
                        Connect
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Button size="xs" variant="ghost" onClick={reset}>
                Close reader setup
              </Button>
            </div>
          )}
          {phase === 'ready' && (
            <div className="flex gap-2">
              <Button size="sm" onClick={collect}>Present card &amp; collect</Button>
              <Button size="sm" variant="ghost" onClick={reset}>Disconnect reader</Button>
            </div>
          )}
          {phase === 'collecting' && (
            <Button size="sm" variant="ghost" onClick={cancelCollection}>Cancel tap</Button>
          )}
        </div>
      )}

      {canCancelAttempt && ['ready', 'select_reader', 'error'].includes(phase) && (
        <Button size="sm" variant="outline" onClick={() => sessionRef.current?.cancelAttempt()}>
          Cancel payment attempt
        </Button>
      )}

      {phase === 'success' && (
        <p className="text-sm text-emerald-600">Payment captured. The invoice will update after Stripe confirms it.</p>
      )}

      {message && (
        <p role={phase === 'error' ? 'alert' : 'status'} className={phase === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message}</p>
      )}
    </div>
  )
}

function PhaseStatus({ phase }: { phase: Phase }) {
  const labels: Partial<Record<Phase, string>> = {
    disconnecting: 'Disconnecting reader…',
    initializing: 'Initialising Stripe Terminal…',
    discovering: 'Searching for readers…',
    select_reader: 'Select a reader:',
    connecting: 'Connecting to reader…',
    ready: 'Reader connected. Ask the customer to tap, insert, or swipe.',
    collecting: 'Waiting for card tap…',
    canceling: 'Canceling card collection…',
    canceling_attempt: 'Canceling the payment attempt…',
    processing: 'Processing payment. Please wait…',
    capturing: 'Capturing payment…',
  }
  return <p className="font-medium">{labels[phase] ?? phase}</p>
}

export type { TerminalConnectionStatus }

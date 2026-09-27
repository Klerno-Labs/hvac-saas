import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactNode, type ReactElement, type ButtonHTMLAttributes } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import GlobalError from '@/app/global-error'

const mocks = vi.hoisted(() => ({ captureException: vi.fn(), effects: [] as Array<() => void> }))
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  // Run the boundary's mount effect explicitly without a browser dependency.
  useEffect: (effect: () => void) => { mocks.effects.push(effect) },
}))

beforeEach(() => { mocks.captureException.mockReset(); mocks.effects.length = 0 })
afterEach(() => vi.unstubAllEnvs())

function retryButton(node: ReactNode): ReactElement<ButtonHTMLAttributes<HTMLButtonElement>> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return
  if (node.type === 'button') return node as ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>
  for (const child of Children.toArray(node.props.children)) {
    const button = retryButton(child)
    if (button) return button
  }
}

describe('global recovery screen', () => {
  it('provides a complete accessible document without exposing error messages or digests', () => {
    const error = Object.assign(new Error('private-customer@example.test /portal/private-token'), { digest: 'private-digest' })
    const html = renderToStaticMarkup(GlobalError({ error, reset: vi.fn() }))
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('aria-labelledby="recovery-title"')
    expect(html).toContain('<h1 id="recovery-title"')
    expect(html).toContain('Try again')
    expect(html).toContain('href="/dashboard"')
    expect(html).not.toContain('private-')
    expect(mocks.captureException).not.toHaveBeenCalled()
  })

  it.each(['', '   '])('does not attempt telemetry when the browser destination is absent', dsn => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', dsn)
    GlobalError({ error: new Error('private-error'), reset: vi.fn() })
    mocks.effects.forEach(effect => effect())
    expect(mocks.captureException).not.toHaveBeenCalled()
  })

  it('reports a render exception through the configured SDK after mounting', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://fixture@sentry.example.test/123')
    const error = new Error('private-error')
    GlobalError({ error, reset: vi.fn() })
    mocks.effects.forEach(effect => effect())
    expect(mocks.captureException).toHaveBeenCalledOnce()
    expect(mocks.captureException).toHaveBeenCalledWith(error)
  })

  it('keeps recovery usable when the monitoring SDK throws', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://fixture@sentry.example.test/123')
    mocks.captureException.mockImplementation(() => { throw new Error('provider unavailable') })
    const reset = vi.fn()
    const page = GlobalError({ error: new Error('private-error'), reset })
    expect(() => mocks.effects.forEach(effect => effect())).not.toThrow()
    const button = retryButton(page)
    expect(button?.props.type).toBe('button')
    expect(button?.props.onClick).toBe(reset)
    reset.mockClear()
    button?.props.onClick?.({} as Parameters<NonNullable<typeof button.props.onClick>>[0])
    expect(reset).toHaveBeenCalledOnce()
  })
})

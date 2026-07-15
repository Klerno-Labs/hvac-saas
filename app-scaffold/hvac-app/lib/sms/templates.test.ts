import { vi, describe, it, expect } from 'vitest'
vi.mock('server-only', () => ({}))

import { renderTemplate, type SmsTemplateVars } from '@/lib/sms/templates'

const STOP_FOOTER = ' Reply STOP to opt out.'
const base: SmsTemplateVars = { companyName: 'Acme HVAC' }

function occurrences(str: string, sub: string): number {
  return str.split(sub).length - 1
}

describe('reminder template', () => {
  it('renders with all vars and stays under 320 chars', () => {
    const result = renderTemplate('reminder', {
      ...base,
      customerName: 'Jane',
      jobDate: 'Monday, June 30',
      jobTimeWindow: '2pm-4pm',
    })
    expect(result).toContain('Acme HVAC')
    expect(result).toContain('Jane')
    expect(result).toContain('Monday, June 30')
    expect(result.length).toBeLessThan(320)
  })

  it('omits greeting when customerName is absent', () => {
    const result = renderTemplate('reminder', base)
    expect(result).not.toContain('Hi ')
    expect(result).not.toContain('undefined')
  })

  it('includes STOP footer exactly once', () => {
    const result = renderTemplate('reminder', { ...base, customerName: 'Bob' })
    expect(occurrences(result, STOP_FOOTER)).toBe(1)
    expect(result.endsWith(STOP_FOOTER)).toBe(true)
  })

  it('gracefully omits missing optional vars', () => {
    const result = renderTemplate('reminder', base)
    expect(result).not.toContain('undefined')
    expect(result).not.toContain('null')
  })
})

describe('confirmation template', () => {
  it('renders with all vars and stays under 320 chars', () => {
    const result = renderTemplate('confirmation', {
      ...base,
      customerName: 'John',
      jobDate: 'Tuesday, July 1',
      jobTimeWindow: '10am-12pm',
    })
    expect(result).toContain('confirmed')
    expect(result).toContain('Acme HVAC')
    expect(result.length).toBeLessThan(320)
  })

  it('omits greeting when customerName is absent', () => {
    const result = renderTemplate('confirmation', base)
    expect(result).not.toContain('Hi ')
    expect(result).not.toContain('undefined')
  })

  it('includes STOP footer exactly once', () => {
    const result = renderTemplate('confirmation', base)
    expect(occurrences(result, STOP_FOOTER)).toBe(1)
  })
})

describe('on_my_way template', () => {
  it('renders with all vars and stays under 320 chars', () => {
    const result = renderTemplate('on_my_way', {
      ...base,
      customerName: 'Sarah',
      techName: 'Mike',
      etaMinutes: 15,
    })
    expect(result).toContain('Mike')
    expect(result).toContain('15')
    expect(result.length).toBeLessThan(320)
  })

  it('omits greeting when customerName is absent', () => {
    const result = renderTemplate('on_my_way', base)
    expect(result).not.toContain('Hi ')
    expect(result).not.toContain('undefined')
  })

  it('includes STOP footer exactly once', () => {
    const result = renderTemplate('on_my_way', { ...base, etaMinutes: 10 })
    expect(occurrences(result, STOP_FOOTER)).toBe(1)
  })

  it('omits ETA when etaMinutes is absent', () => {
    const result = renderTemplate('on_my_way', { ...base, techName: 'Alex' })
    expect(result).not.toContain('undefined')
    expect(result).not.toContain('null')
    expect(result).not.toContain('min')
  })
})

describe('renderTemplate error handling', () => {
  it('throws a clear error on an unknown template id', () => {
    expect(() => renderTemplate('unknown' as never, base)).toThrow(/Unknown SMS template id/)
  })
})

import { describe, it, expect } from 'vitest'
import type { Prisma } from '@prisma/client'

describe('BookingRequest schema types', () => {
  it('BookingRequestCreateInput accepts required fields and omits status (relies on default)', () => {
    const input: Prisma.BookingRequestCreateInput = {
      serviceType: 'AC Tune-Up',
      preferredWindow: 'Weekday mornings',
      contactName: 'Jane Smith',
      contactPhone: '555-0100',
      organization: { connect: { id: 'org_placeholder' } },
    }
    expect(input.serviceType).toBe('AC Tune-Up')
  })

  it('CustomerUncheckedCreateInput accepts leadSource', () => {
    const input: Prisma.CustomerUncheckedCreateInput = {
      organizationId: 'org_placeholder',
      firstName: 'Jane',
      leadSource: 'web',
    }
    expect(input.leadSource).toBe('web')
  })
})

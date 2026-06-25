import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'

describe('BookingRequest schema', () => {
  it('accepts a valid BookingRequestCreateInput', () => {
    const input: Prisma.BookingRequestCreateInput = {
      serviceType: 'AC Repair',
      preferredWindow: 'Weekday mornings',
      contactName: 'Jane Smith',
      contactPhone: '555-867-5309',
      organization: { connect: { id: 'org_test' } },
    }
    expect(input.serviceType).toBe('AC Repair')
  })

  it('accepts a CustomerUncheckedCreateInput with leadSource', () => {
    const input: Prisma.CustomerUncheckedCreateInput = {
      organizationId: 'org_test',
      firstName: 'Jane',
      leadSource: 'web',
    }
    expect(input.leadSource).toBe('web')
  })
})

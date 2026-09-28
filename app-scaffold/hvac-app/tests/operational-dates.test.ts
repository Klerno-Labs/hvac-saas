import { describe, expect, it } from 'vitest'
import { createReminderSchema } from '@/lib/validations/reminder'
import { createRecurringJobSchema } from '@/lib/validations/recurring-job'
import { createEquipmentSchema } from '@/lib/validations/equipment'
import { formatDateOnly, isDueDatePast } from '@/lib/format'
describe('operational date-only values', () => {
  it.each(['2026-02-30', 'not-a-date', '2026-09-28T01:00:00Z'])('rejects invalid operational date %s before persistence', date => {
    expect(createReminderSchema.safeParse({ title: 'Follow up', dueAt: date }).success).toBe(false)
    expect(createRecurringJobSchema.safeParse({ customerId: 'c', title: 'Maintenance', frequency: 'monthly', nextDueDate: date }).success).toBe(false)
    expect(createEquipmentSchema.safeParse({ customerId: 'c', type: 'furnace', installDate: date }).success).toBe(false)
  })
  it('keeps a selected reminder day intact and does not mark it overdue at the UTC boundary', () => {
    expect(formatDateOnly(new Date('2026-09-28T00:00:00Z'))).toBe('Sep 28, 2026')
    expect(isDueDatePast('2026-09-28', new Date('2026-09-29T02:00:00Z'), 'America/Chicago')).toBe(false)
    expect(isDueDatePast('2026-09-28', new Date('2026-09-29T06:00:00Z'), 'America/Chicago')).toBe(true)
  })
  it('allows missing optional dates but requires a recurring start day', () => {
    expect(createReminderSchema.safeParse({ title: 'Follow up' }).success).toBe(true)
    expect(createRecurringJobSchema.safeParse({ customerId: 'c', title: 'Maintenance', frequency: 'monthly', nextDueDate: '' }).success).toBe(false)
  })
})

describe('equipment storage boundaries', () => {
  it.each([-1, 1.5, 2147483648, Infinity])('rejects invalid integer equipment values %s', value => {
    expect(createEquipmentSchema.safeParse({ customerId: 'c', type: 'furnace', btu: value }).success).toBe(false)
    expect(createEquipmentSchema.safeParse({ customerId: 'c', type: 'furnace', partsWarrantyMonths: value }).success).toBe(false)
  })
})

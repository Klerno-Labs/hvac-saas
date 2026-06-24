import { describe, it, expect } from 'vitest'
import { calculateARAging, calculateAverageTicket, getDateRange } from '../lib/analytics'

describe('Analytics Utilities', () => {
  describe('calculateAverageTicket', () => {
    it('calculates average ticket from paid invoices', () => {
      const invoices = [
        { totalCents: 10000 },
        { totalCents: 20000 },
        { totalCents: 30000 },
      ]
      const result = calculateAverageTicket(invoices)
      expect(result).toBe(20000)
    })

    it('returns 0 for empty array', () => {
      const result = calculateAverageTicket([])
      expect(result).toBe(0)
    })

    it('handles single invoice', () => {
      const invoices = [{ totalCents: 15000 }]
      const result = calculateAverageTicket(invoices)
      expect(result).toBe(15000)
    })
  })

  describe('calculateARAging', () => {
    const mockOrganization = {
      collectionsOverdue1Days: 7,
      collectionsOverdue2Days: 14,
    }

    it('categorizes current invoices correctly', () => {
      const now = new Date()
      const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      
      const invoices = [
        { outstandingCents: 5000, dueDate: futureDate },
      ]
      
      const result = calculateARAging(invoices, mockOrganization)
      expect(result.current).toBe(5000)
      expect(result.overdue1).toBe(0)
      expect(result.overdue2).toBe(0)
      expect(result.overdue3).toBe(0)
    })

    it('categorizes overdue1 invoices correctly', () => {
      const now = new Date()
      const overdueDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      
      const invoices = [
        { outstandingCents: 3000, dueDate: overdueDate },
      ]
      
      const result = calculateARAging(invoices, mockOrganization)
      expect(result.current).toBe(0)
      expect(result.overdue1).toBe(3000)
      expect(result.overdue2).toBe(0)
      expect(result.overdue3).toBe(0)
    })

    it('categorizes overdue2 invoices correctly', () => {
      const now = new Date()
      const overdueDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      
      const invoices = [
        { outstandingCents: 2000, dueDate: overdueDate },
      ]
      
      const result = calculateARAging(invoices, mockOrganization)
      expect(result.current).toBe(0)
      expect(result.overdue1).toBe(0)
      expect(result.overdue2).toBe(2000)
      expect(result.overdue3).toBe(0)
    })

    it('categorizes overdue3 invoices correctly', () => {
      const now = new Date()
      const overdueDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)
      
      const invoices = [
        { outstandingCents: 1000, dueDate: overdueDate },
      ]
      
      const result = calculateARAging(invoices, mockOrganization)
      expect(result.current).toBe(0)
      expect(result.overdue1).toBe(0)
      expect(result.overdue2).toBe(0)
      expect(result.overdue3).toBe(1000)
    })

    it('handles invoices with null due dates as current', () => {
      const invoices = [
        { outstandingCents: 4000, dueDate: null },
      ]
      
      const result = calculateARAging(invoices, mockOrganization)
      expect(result.current).toBe(4000)
    })

    it('sums multiple invoices correctly', () => {
      const now = new Date()
      const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const overdue1Date = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      const overdue2Date = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      const overdue3Date = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)
      
      const invoices = [
        { outstandingCents: 5000, dueDate: futureDate },
        { outstandingCents: 3000, dueDate: overdue1Date },
        { outstandingCents: 2000, dueDate: overdue2Date },
        { outstandingCents: 1000, dueDate: overdue3Date },
        { outstandingCents: 4000, dueDate: null },
      ]
      
      const result = calculateARAging(invoices, mockOrganization)
      expect(result.current).toBe(9000)
      expect(result.overdue1).toBe(3000)
      expect(result.overdue2).toBe(2000)
      expect(result.overdue3).toBe(1000)
    })
  })

  describe('getDateRange', () => {
    it('returns correct range for 7d period', () => {
      const { start, end } = getDateRange('7d')
      const now = new Date()
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      
      expect(end.getTime()).toBeCloseTo(now.getTime(), -3)
      expect(start.getTime()).toBeCloseTo(sevenDaysAgo.getTime(), -3)
    })

    it('returns correct range for 30d period', () => {
      const { start, end } = getDateRange('30d')
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      
      expect(end.getTime()).toBeCloseTo(now.getTime(), -3)
      expect(start.getTime()).toBeCloseTo(thirtyDaysAgo.getTime(), -3)
    })

    it('returns correct range for 90d period', () => {
      const { start, end } = getDateRange('90d')
      const now = new Date()
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      
      expect(end.getTime()).toBeCloseTo(now.getTime(), -3)
      expect(start.getTime()).toBeCloseTo(ninetyDaysAgo.getTime(), -3)
    })

    it('returns correct range for all period', () => {
      const { start, end } = getDateRange('all')
      const now = new Date()
      const tenYearsAgo = new Date()
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10)
      
      expect(end.getTime()).toBeCloseTo(now.getTime(), -3)
      expect(start.getFullYear()).toBeLessThanOrEqual(now.getFullYear() - 10)
    })
  })
})
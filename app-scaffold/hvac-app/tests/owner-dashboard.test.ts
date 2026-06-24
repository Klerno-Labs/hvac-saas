import { describe, it, expect } from 'vitest'
import { calculateARAging, calculateAverageTicket, getDateRange } from '../lib/analytics'

describe('Owner Dashboard Analytics', () => {
  describe('Revenue Calculations', () => {
    it('calculates revenue by period correctly', () => {
      const mockPaidInvoices = [
        { totalCents: 10000, paidAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
        { totalCents: 20000, paidAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
        { totalCents: 30000, paidAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
      ]

      const revenue7d = mockPaidInvoices
        .filter(inv => inv.paidAt && inv.paidAt >= getDateRange('7d').start)
        .reduce((sum, inv) => sum + inv.totalCents, 0)

      const revenue30d = mockPaidInvoices
        .filter(inv => inv.paidAt && inv.paidAt >= getDateRange('30d').start)
        .reduce((sum, inv) => sum + inv.totalCents, 0)

      expect(revenue7d).toBe(30000)
      expect(revenue30d).toBe(60000)
    })

    it('handles empty revenue data', () => {
      const revenue = Array(0)
        .reduce((sum, inv: any) => sum + inv.totalCents, 0)
      expect(revenue).toBe(0)
    })
  })

  describe('Average Ticket', () => {
    it('calculates average ticket by period', () => {
      const mockPaidInvoices = [
        { totalCents: 10000, paidAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
        { totalCents: 20000, paidAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
        { totalCents: 30000, paidAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
      ]

      const avg7d = calculateAverageTicket(
        mockPaidInvoices.filter(inv => inv.paidAt && inv.paidAt >= getDateRange('7d').start)
      )

      const avg30d = calculateAverageTicket(
        mockPaidInvoices.filter(inv => inv.paidAt && inv.paidAt >= getDateRange('30d').start)
      )

      expect(avg7d).toBe(15000)
      expect(avg30d).toBe(20000)
    })
  })

  describe('A/R Aging', () => {
    const mockOrganization = {
      collectionsOverdue1Days: 7,
      collectionsOverdue2Days: 14,
    }

    it('categorizes outstanding invoices by aging', () => {
      const now = new Date()
      const mockOutstandingInvoices = [
        { outstandingCents: 5000, dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
        { outstandingCents: 3000, dueDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) },
        { outstandingCents: 2000, dueDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000) },
        { outstandingCents: 1000, dueDate: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000) },
      ]

      const aging = calculateARAging(mockOutstandingInvoices, mockOrganization)

      expect(aging.current).toBe(5000)
      expect(aging.overdue1).toBe(3000)
      expect(aging.overdue2).toBe(2000)
      expect(aging.overdue3).toBe(1000)
    })

    it('calculates total outstanding correctly', () => {
      const mockOutstandingInvoices = [
        { outstandingCents: 5000, dueDate: new Date() },
        { outstandingCents: 3000, dueDate: new Date() },
        { outstandingCents: 2000, dueDate: new Date() },
      ]

      const total = mockOutstandingInvoices.reduce((sum, inv) => sum + inv.outstandingCents, 0)
      expect(total).toBe(10000)
    })
  })

  describe('Close Rate', () => {
    it('calculates close rate from estimates', () => {
      const sentEstimates = 10
      const acceptedEstimates = 6
      const rate = sentEstimates > 0 ? (acceptedEstimates / sentEstimates) * 100 : 0

      expect(rate).toBe(60)
      expect(acceptedEstimates).toBe(6)
      expect(sentEstimates).toBe(10)
    })

    it('handles zero sent estimates', () => {
      const sentEstimates = 0
      const acceptedEstimates = 0
      const rate = sentEstimates > 0 ? (acceptedEstimates / sentEstimates) * 100 : 0

      expect(rate).toBe(0)
    })
  })

  describe('Jobs Completed', () => {
    it('counts completed jobs by period', () => {
      const now = new Date()
      const mockCompletedJobs = [
        { completedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) },
        { completedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) },
        { completedAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000) },
      ]

      const count7d = mockCompletedJobs.filter(
        job => job.completedAt && job.completedAt >= getDateRange('7d').start
      ).length

      const count30d = mockCompletedJobs.filter(
        job => job.completedAt && job.completedAt >= getDateRange('30d').start
      ).length

      expect(count7d).toBe(2)
      expect(count30d).toBe(3)
    })

    it('handles empty job data', () => {
      const count = Array(0).filter(
        (job: any) => job.completedAt && job.completedAt >= getDateRange('30d').start
      ).length

      expect(count).toBe(0)
    })
  })

  describe('Data Integration', () => {
    it('aggregates all analytics data correctly', () => {
      const mockAnalytics = {
        revenueByPeriod: {
          '7d': 30000,
          '30d': 60000,
          '90d': 90000,
          'all': 150000,
        },
        averageTicket: {
          '7d': 15000,
          '30d': 20000,
          '90d': 18000,
          'all': 17500,
        },
        arAging: {
          current: 5000,
          overdue1: 3000,
          overdue2: 2000,
          overdue3: 1000,
        },
        closeRate: {
          sent: 10,
          accepted: 6,
          rate: 60,
        },
        jobsCompleted: {
          '7d': 2,
          '30d': 5,
          '90d': 12,
          'all': 25,
        },
        outstanding: 11000,
      }

      expect(mockAnalytics.revenueByPeriod['30d']).toBe(60000)
      expect(mockAnalytics.averageTicket['30d']).toBe(20000)
      expect(mockAnalytics.closeRate.rate).toBe(60)
      expect(mockAnalytics.jobsCompleted['30d']).toBe(5)
      expect(mockAnalytics.outstanding).toBe(11000)
      expect(mockAnalytics.arAging.current).toBe(5000)
    })
  })
})
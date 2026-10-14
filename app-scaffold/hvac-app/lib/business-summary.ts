import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { startOfBusinessDayAsUtcDate } from "@/lib/format";

/** All monetary metrics use full aggregates, never a paginated display list. */
export function receivableWhere(
  organizationId: string,
): Prisma.InvoiceWhereInput {
  return {
    organizationId,
    status: { in: ["sent", "overdue"] },
    outstandingCents: { gt: 0 },
  };
}
export function overdueWhere(
  organizationId: string,
  now: Date,
  timezone?: string | null,
): Prisma.InvoiceWhereInput {
  const today = startOfBusinessDayAsUtcDate(now, timezone);
  return {
    ...receivableWhere(organizationId),
    OR: [{ status: "overdue" }, { dueDate: { lt: today } }],
  };
}
export async function getBusinessSummary(
  organizationId: string,
  now = new Date(),
  timezone?: string | null,
) {
  const periodStart = new Date(now.getTime() - 30 * 86400000);
  return db.$transaction(
    async (tx) => {
      const [receivables, overdue, collected, jobs, estimates, recentInvoices] =
        await Promise.all([
          tx.invoice.aggregate({
            where: receivableWhere(organizationId),
            _sum: { outstandingCents: true },
            _count: { _all: true },
          }),
          tx.invoice.aggregate({
            where: overdueWhere(organizationId, now, timezone),
            _sum: { outstandingCents: true },
            _count: { _all: true },
          }),
          tx.payment.aggregate({
            where: {
              organizationId,
              status: "succeeded",
              currency: "usd",
              paidAt: { gte: periodStart, lte: now },
            },
            _sum: { amountCents: true },
            _count: { _all: true },
          }),
          tx.job.groupBy({
            by: ["status"],
            where: { organizationId },
            _count: { _all: true },
          }),
          tx.estimate.groupBy({
            by: ["status"],
            where: {
              organizationId,
              createdAt: { gte: periodStart, lte: now },
            },
            _count: { _all: true },
            _sum: { totalCents: true },
          }),
          tx.invoice.findMany({
            where: receivableWhere(organizationId),
            include: {
              customer: { select: { firstName: true, lastName: true } },
            },
            orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
            take: 10,
          }),
        ]);
      return {
        periodStart,
        asOf: now,
        receivableCents: receivables._sum.outstandingCents ?? 0,
        receivableCount: receivables._count._all,
        overdueCents: overdue._sum.outstandingCents ?? 0,
        overdueCount: overdue._count._all,
        collectedCents: collected._sum.amountCents ?? 0,
        collectedCount: collected._count._all,
        jobs,
        estimates,
        recentInvoices,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

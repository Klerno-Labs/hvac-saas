import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

if (
  !process.env.TEST_DATABASE_URL ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error("Dedicated TEST_DATABASE_URL required");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { db } = await import("@/lib/db");
const { getBusinessSummary, overdueWhere } = await import(
  "@/lib/business-summary"
);
const now = new Date("2026-09-26T12:00:00Z");
let organizationId: string;
let otherOrganizationId: string;
let customerId: string;
let jobId: string;

beforeAll(async () => {
  organizationId = (
    await db.organization.create({
      data: { name: "Business reporting fixture" },
    })
  ).id;
  otherOrganizationId = (
    await db.organization.create({
      data: { name: "Unrelated reporting fixture" },
    })
  ).id;
  customerId = (
    await db.customer.create({ data: { organizationId, firstName: "Alex" } })
  ).id;
  jobId = (
    await db.job.create({
      data: {
        organizationId,
        customerId,
        title: "Service",
        status: "scheduled",
      },
    })
  ).id;
  await db.invoice.createMany({
    data: [
      ...Array.from({ length: 12 }, () => ({
        organizationId,
        customerId,
        jobId,
        invoiceNumber: randomUUID(),
        status: "sent",
        totalCents: 1000,
        outstandingCents: 1000,
        dueDate: new Date("2026-10-01T00:00:00Z"),
      })),
      ...["draft", "void", "paid"].map((status) => ({
        organizationId,
        customerId,
        jobId,
        invoiceNumber: randomUUID(),
        status,
        totalCents: 100000,
        outstandingCents: 100000,
      })),
      {
        organizationId,
        customerId,
        jobId,
        invoiceNumber: "Due-today",
        status: "sent",
        totalCents: 700,
        outstandingCents: 700,
        dueDate: new Date("2026-09-26T00:00:00Z"),
      },
      {
        organizationId,
        customerId,
        jobId,
        invoiceNumber: "Past-due",
        status: "sent",
        totalCents: 2500,
        outstandingCents: 1500,
        dueDate: new Date("2026-09-01T00:00:00Z"),
      },
      {
        organizationId,
        customerId,
        jobId,
        invoiceNumber: "Flagged-overdue",
        status: "overdue",
        totalCents: 500,
        outstandingCents: 500,
      },
      {
        organizationId,
        customerId,
        jobId,
        invoiceNumber: "Settled",
        status: "sent",
        totalCents: 3000,
        outstandingCents: 0,
        dueDate: new Date("2026-09-01T00:00:00Z"),
      },
    ],
  });
  const otherCustomer = await db.customer.create({
    data: { organizationId: otherOrganizationId, firstName: "Other" },
  });
  const otherJob = await db.job.create({
    data: {
      organizationId: otherOrganizationId,
      customerId: otherCustomer.id,
      title: "Foreign work",
      status: "completed",
    },
  });
  await db.invoice.create({
    data: {
      organizationId: otherOrganizationId,
      customerId: otherCustomer.id,
      jobId: otherJob.id,
      invoiceNumber: "Foreign",
      status: "overdue",
      totalCents: 999999,
      outstandingCents: 999999,
    },
  });
  await db.payment.createMany({
    data: [
      {
        organizationId,
        status: "succeeded",
        currency: "usd",
        amountCents: 3500,
        paidAt: now,
      },
      {
        organizationId,
        status: "succeeded",
        currency: "usd",
        amountCents: 1500,
        paidAt: new Date("2026-09-01T00:00:00Z"),
      },
      {
        organizationId,
        status: "pending",
        currency: "usd",
        amountCents: 99000,
        paidAt: now,
      },
      {
        organizationId,
        status: "failed",
        currency: "usd",
        amountCents: 99000,
        paidAt: now,
      },
      {
        organizationId,
        status: "succeeded",
        currency: "eur",
        amountCents: 99000,
        paidAt: now,
      },
      {
        organizationId,
        status: "succeeded",
        currency: "usd",
        amountCents: 99000,
        paidAt: new Date("2026-08-01T00:00:00Z"),
      },
      {
        organizationId,
        status: "succeeded",
        currency: "usd",
        amountCents: 99000,
        paidAt: new Date("2026-10-01T00:00:00Z"),
      },
      {
        organizationId: otherOrganizationId,
        status: "succeeded",
        currency: "usd",
        amountCents: 99000,
        paidAt: now,
      },
    ],
  });
  await db.estimate.createMany({
    data: [
      {
        organizationId,
        jobId,
        estimateNumber: "Recent",
        status: "accepted",
        totalCents: 5000,
        createdAt: now,
      },
      {
        organizationId,
        jobId,
        estimateNumber: "Old",
        status: "declined",
        totalCents: 5000,
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
      {
        organizationId: otherOrganizationId,
        jobId: otherJob.id,
        estimateNumber: "Foreign",
        status: "accepted",
        totalCents: 99999,
        createdAt: now,
      },
    ],
  });
});

afterAll(async () => {
  await db.organization.deleteMany({
    where: { id: { in: [organizationId, otherOrganizationId] } },
  });
  await db.$disconnect();
});

describe("business summaries against PostgreSQL", () => {
  it("counts every receivable beyond the display limit, excluding settled/draft/void and other companies", async () => {
    const summary = await getBusinessSummary(organizationId, now);
    expect(summary).toMatchObject({
      receivableCents: 14700,
      receivableCount: 15,
      overdueCents: 2000,
      overdueCount: 2,
    });
    expect(summary.recentInvoices).toHaveLength(10);
    expect(
      summary.recentInvoices.every(
        (invoice) => invoice.organizationId === organizationId,
      ),
    ).toBe(true);
  });
  it("counts only confirmed USD payments within the selected rolling window", async () => {
    expect(await getBusinessSummary(organizationId, now)).toMatchObject({
      collectedCents: 5000,
      collectedCount: 2,
    });
  });
  it("keeps job and recent estimate summaries inside their organization and period", async () => {
    const summary = await getBusinessSummary(organizationId, now);
    expect(summary.jobs).toEqual([
      { status: "scheduled", _count: { _all: 1 } },
    ]);
    expect(summary.estimates).toEqual([
      { status: "accepted", _count: { _all: 1 }, _sum: { totalCents: 5000 } },
    ]);
  });
  it("allows search without replacing the overdue rule", async () => {
    const rows = await db.invoice.findMany({
      where: {
        ...overdueWhere(organizationId, now),
        AND: [
          {
            OR: [
              { invoiceNumber: { contains: "Past" } },
              { customer: { firstName: { contains: "Nobody" } } },
            ],
          },
        ],
      },
    });
    expect(rows.map((row) => row.invoiceNumber)).toEqual(["Past-due"]);
  });
  it("does not age due-today invoices before the business calendar day ends", async () => {
    const midnightBoundary = new Date("2026-09-27T01:00:00Z");
    expect(
      (
        await getBusinessSummary(
          organizationId,
          midnightBoundary,
          "America/Chicago",
        )
      ).overdueCents,
    ).toBe(2000);
    expect(
      (await getBusinessSummary(organizationId, midnightBoundary, "UTC"))
        .overdueCents,
    ).toBe(2700);
  });

  it("returns honest zero values for an empty organization", async () => {
    expect(await getBusinessSummary("missing-organization", now)).toMatchObject(
      {
        collectedCents: 0,
        receivableCents: 0,
        overdueCents: 0,
        recentInvoices: [],
        jobs: [],
        estimates: [],
      },
    );
  });
});

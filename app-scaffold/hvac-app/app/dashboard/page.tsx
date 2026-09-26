import { requireActiveSubscription } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Plus, CalendarDays, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GettingStartedChecklist } from "@/app/components/getting-started-checklist";
import { getBusinessSummary, formatMoney } from "@/lib/business-summary";
import { canDo } from "@/lib/permissions";
import { isDueDatePast } from "@/lib/format";

export default async function DashboardPage() {
  const { organization, organizationId, role } =
    await requireActiveSubscription();
  if (!canDo(role, "viewAllJobs")) redirect("/field");
  const canViewMoney = canDo(role, "editPricing");
  const now = new Date();
  const [summary, upcomingJobs] = await Promise.all([
    canViewMoney
      ? getBusinessSummary(organizationId, now, organization.timezone)
      : null,
    db.job.findMany({
      where: {
        organizationId,
        status: { in: ["scheduled", "in_progress"] },
      },
      include: {
        customer: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: [
        { status: "asc" },
        { scheduledFor: { sort: "asc", nulls: "first" } },
      ],
      take: 6,
    }),
  ]);
  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <p className="workspace-kicker">{organization.name}</p>
          <h1>Keep the work moving.</h1>
          <p>Your jobs, next steps, and the details that need attention.</p>
        </div>
        {canDo(role, "manageJobs") && (
          <Link href="/jobs/new" className="button">
            <Plus size={18} aria-hidden="true" />
            New job
          </Link>
        )}
      </div>
      {canDo(role, "manageBilling") &&
        organization.onboardingStatus !== "completed" && (
          <GettingStartedChecklist organizationId={organizationId} />
        )}
      {summary && (
        <section className="business-metrics" aria-label="Business overview">
          <Link href="/reports">
            <span>Collected · last 30 days</span>
            <strong>{formatMoney(summary.collectedCents)}</strong>
            <small>
              {summary.collectedCount} confirmed payment
              {summary.collectedCount === 1 ? "" : "s"}
            </small>
          </Link>
          <Link href="/invoices">
            <span>Outstanding</span>
            <strong>{formatMoney(summary.receivableCents)}</strong>
            <small>
              {summary.receivableCount} sent invoice
              {summary.receivableCount === 1 ? "" : "s"} with a balance
            </small>
          </Link>
          <Link href="/invoices?status=overdue">
            <span>Overdue</span>
            <strong>{formatMoney(summary.overdueCents)}</strong>
            <small>
              {summary.overdueCount} invoice
              {summary.overdueCount === 1 ? " needs" : "s need"} attention
            </small>
          </Link>
        </section>
      )}
      {!organization.stripeChargesEnabled && canDo(role, "manageBilling") && (
        <div className="workspace-notice">
          <div>
            <strong>Set up online payments</strong>
            <p>
              Connect your Stripe account before collecting customer payments.
            </p>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 font-semibold underline underline-offset-4"
          >
            Payment settings
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      )}
      <div className="workspace-columns">
        <section className="workspace-panel">
          <div className="panel-heading">
            <div>
              <p className="workspace-kicker">On the calendar</p>
              <h2>Scheduled & active</h2>
            </div>
            <Link href="/calendar" aria-label="View full calendar">
              <CalendarDays size={20} />
            </Link>
          </div>
          {upcomingJobs.length ? (
            <ul className="work-list">
              {upcomingJobs.map((job) => (
                <li key={job.id}>
                  <Link href={`/jobs/${job.id}` as never}>
                    <div>
                      <strong>{job.title}</strong>
                      <p>
                        {job.customer.firstName} {job.customer.lastName} ·{" "}
                        {job.assignedTo?.name || "Unassigned"}
                      </p>
                    </div>
                    <div className="work-list-end">
                      <time dateTime={job.scheduledFor?.toISOString()}>
                        {job.scheduledFor?.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })}
                      </time>
                      <Badge variant="outline">
                        {job.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="workspace-empty">
              <CalendarDays size={28} aria-hidden="true" />
              <h3>Your schedule has room.</h3>
              <p>Schedule a job to see the next visit here.</p>
              <Link href="/jobs">
                Review jobs <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          )}
          <Link href="/jobs" className="panel-footer">
            View all jobs <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
        {summary && (
          <section className="workspace-panel">
            <div className="panel-heading">
              <div>
                <p className="workspace-kicker">From work to paid</p>
                <h2>Open invoices</h2>
              </div>
              <span className="text-sm text-muted-foreground">
                {summary.receivableCount} total
              </span>
            </div>
            {summary.recentInvoices.length ? (
              <ul className="work-list">
                {summary.recentInvoices.map((inv) => (
                  <li key={inv.id}>
                    <Link href={`/invoices/${inv.id}` as never}>
                      <div>
                        <strong>{inv.invoiceNumber}</strong>
                        <p>
                          {inv.customer.firstName} {inv.customer.lastName}
                        </p>
                      </div>
                      <div className="work-list-end">
                        <strong>{formatMoney(inv.outstandingCents)}</strong>
                        <Badge variant="outline">
                          {inv.status === "overdue" ||
                          (inv.dueDate &&
                            isDueDatePast(
                              inv.dueDate,
                              now,
                              organization.timezone,
                            ))
                            ? "Overdue"
                            : "Sent"}
                        </Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="workspace-empty">
                <h3>No outstanding invoices.</h3>
                <p>Sent invoices with unpaid balances will appear here.</p>
                <Link href="/estimates">
                  Review estimates <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            )}
            <Link href="/invoices" className="panel-footer">
              View all invoices <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}

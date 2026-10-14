import { requireActiveSubscription } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { canDo } from "@/lib/permissions";
import { getBusinessSummary, formatMoney } from "@/lib/business-summary";

export default async function ReportsPage() {
  const { organizationId, organization, role } =
    await requireActiveSubscription();
  if (!canDo(role, "editPricing")) redirect("/dashboard");
  const summary = await getBusinessSummary(
    organizationId,
    new Date(),
    organization.timezone,
  );
  const accepted =
    summary.estimates.find((row) => row.status === "accepted")?._count._all ??
    0;
  const declined =
    summary.estimates.find((row) => row.status === "declined")?._count._all ??
    0;
  const decided = accepted + declined;
  return (
    <main className="workspace-page">
      <div className="workspace-heading">
        <div>
          <p className="workspace-kicker">{organization.name}</p>
          <h1>See how business is moving.</h1>
          <p>
            Confirmed collections and current balances, with every invoice
            counted.
          </p>
        </div>
        <Link href="/invoices" className="button">
          Review invoices
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </div>
      <section className="business-metrics" aria-label="Financial overview">
        <div>
          <span>Collected · last 30 days</span>
          <strong>{formatMoney(summary.collectedCents)}</strong>
          <small>
            {summary.collectedCount} successful USD payment
            {summary.collectedCount === 1 ? "" : "s"}
          </small>
        </div>
        <div>
          <span>Outstanding · all time</span>
          <strong>{formatMoney(summary.receivableCents)}</strong>
          <small>
            {summary.receivableCount} sent invoice
            {summary.receivableCount === 1 ? "" : "s"} with a balance
          </small>
        </div>
        <div>
          <span>Overdue · as of today</span>
          <strong>{formatMoney(summary.overdueCents)}</strong>
          <small>
            {summary.overdueCount} invoice
            {summary.overdueCount === 1 ? " needs" : "s need"} attention
          </small>
        </div>
      </section>
      <p className="text-sm text-muted-foreground mb-8">
        Collections are gross confirmed payments, before processing fees and
        refunds. Draft and void invoices are excluded from receivables. Payment
        dates use UTC.
      </p>
      <div className="workspace-columns">
        <section className="workspace-panel">
          <div className="panel-heading">
            <div>
              <p className="workspace-kicker">Current workload</p>
              <h2>Jobs by status</h2>
            </div>
          </div>
          <dl className="report-rows">
            {[
              "draft",
              "booked",
              "scheduled",
              "in_progress",
              "completed",
              "cancelled",
            ].map((status) => (
              <div key={status}>
                <dt>{status.replaceAll("_", " ")}</dt>
                <dd>
                  {summary.jobs.find((row) => row.status === status)?._count
                    ._all ?? 0}
                </dd>
              </div>
            ))}
          </dl>
          <Link href="/jobs" className="panel-footer">
            Open jobs
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
        <section className="workspace-panel">
          <div className="panel-heading">
            <div>
              <p className="workspace-kicker">Created in the last 30 days</p>
              <h2>Estimate decisions</h2>
            </div>
          </div>
          <div className="px-6 pb-6">
            <p className="text-4xl font-semibold tracking-tight">
              {decided ? `${Math.round((accepted / decided) * 100)}%` : "—"}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Accepted among {decided} decided estimate
              {decided === 1 ? "" : "s"}. Undecided drafts and sent estimates
              are excluded from the rate.
            </p>
          </div>
          <dl className="report-rows">
            {["draft", "sent", "accepted", "declined"].map((status) => (
              <div key={status}>
                <dt>{status}</dt>
                <dd>
                  {summary.estimates.find((row) => row.status === status)
                    ?._count._all ?? 0}
                </dd>
              </div>
            ))}
          </dl>
          <Link href="/estimates" className="panel-footer">
            Open estimates
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>
      <p className="text-xs text-muted-foreground mt-6">
        Updated {summary.asOf.toISOString().slice(0, 16).replace("T", " ")} UTC.
        Operational summary, not an accounting statement.
      </p>
    </main>
  );
}

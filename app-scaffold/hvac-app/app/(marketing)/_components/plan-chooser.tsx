"use client";
import { useState } from "react";
import Link from "next/link";
import { recommendPlan } from "@/lib/self-service-tools";
import { trackPublicFunnel } from "@/lib/track-public-funnel";
import type { TradeId } from "@/lib/trades";
export function PlanChooser({
  prices,
  trade,
}: {
  prices: { starter: number; pro: number };
  trade: TradeId;
}) {
  const [team, setTeam] = useState(false);
  const [collections, setCollections] = useState(false);
  const plan = recommendPlan(team, collections);
  return (
    <section className="plan-chooser" aria-labelledby="choose-plan">
      <div>
        <h2 id="choose-plan">Find your fit. No call needed.</h2>
        <p>
          Choose what your business needs. Both plans include customers, jobs,
          estimates and invoices.
        </p>
        <label>
          <input
            type="checkbox"
            checked={team}
            onChange={(event) => {
              setTeam(event.target.checked);
              trackPublicFunnel("plan_recommended");
            }}
          />
          I need team members to access the workspace.
        </label>
        <label>
          <input
            type="checkbox"
            checked={collections}
            onChange={(event) => {
              setCollections(event.target.checked);
              trackPublicFunnel("plan_recommended");
            }}
          />
          I need automated follow-ups on unpaid invoices.
        </label>
      </div>
      <div className="plan-recommendation" aria-live="polite">
        <p>Based on your selections</p>
        <strong>
          {plan === "pro" ? "Pro" : "Starter"} · ${prices[plan]}/month
        </strong>
        <p>
          {plan === "pro"
            ? "Includes team access and collections automation. Delivery services and payment processing must be configured."
            : "The core workflow for an owner managing customers, work and payments."}
        </p>
        <p className="hero-note">
          USD. Processing and applicable platform fees are separate.
        </p>
        <div className="plan-actions">
          <Link className="button" href={`/signup?trade=${trade}&plan=${plan}`}>
            Try {plan === "pro" ? "Pro" : "Starter"} free
          </Link>
          <Link
            className="button secondary"
            href={`/demo?trade=${trade}&plan=${plan}`}
          >
            Explore the workflow
          </Link>
        </div>
      </div>
    </section>
  );
}

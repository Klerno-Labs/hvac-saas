export const JOB_PRICING_LIMITS = {
  materials: 1_000_000,
  laborHours: 10_000,
  hourlyLaborCost: 10_000,
  overhead: 1_000_000,
  targetGrossMargin: 99,
} as const;

export type JobPricingInputs = Record<keyof typeof JOB_PRICING_LIMITS, number>;

/** Planning figures in USD; no tax, card fees, or unentered costs are inferred. */
export function calculateJobPricing(inputs: JobPricingInputs) {
  for (const key of Object.keys(JOB_PRICING_LIMITS) as (keyof JobPricingInputs)[]) {
    if (!Number.isFinite(inputs[key]) || inputs[key] < 0 || inputs[key] > JOB_PRICING_LIMITS[key]) {
      return null;
    }
  }

  // Stabilize half-cent values such as 1.5 hours × $0.67 against binary drift.
  const cents = (amount: number) => {
    const value = amount * 100;
    return Math.round(value + Number.EPSILON * Math.max(1, value));
  };
  const materialsCents = cents(inputs.materials);
  const laborCents = cents(inputs.laborHours * inputs.hourlyLaborCost);
  const overheadCents = cents(inputs.overhead);
  const directCostCents = materialsCents + laborCents;
  const breakEvenCents = directCostCents + overheadCents;
  // Round the selling price up so cent rounding cannot undercut the target.
  // The tiny tolerance avoids an extra cent from floating-point division noise.
  const targetPriceCents = Math.ceil(directCostCents / (1 - inputs.targetGrossMargin / 100) - 1e-7);
  const priceCents = Math.max(targetPriceCents, breakEvenCents);
  const grossProfitCents = priceCents - directCostCents;

  return {
    materials: materialsCents / 100,
    laborCost: laborCents / 100,
    directCost: directCostCents / 100,
    overhead: overheadCents / 100,
    breakEvenPrice: breakEvenCents / 100,
    targetMarginPrice: targetPriceCents / 100,
    suggestedPrice: priceCents / 100,
    grossProfit: grossProfitCents / 100,
    afterOverhead: (priceCents - breakEvenCents) / 100,
    actualGrossMargin: priceCents > 0 ? (grossProfitCents / priceCents) * 100 : null,
    markup: directCostCents > 0 ? (grossProfitCents / directCostCents) * 100 : null,
    overheadRaisesPrice: breakEvenCents > targetPriceCents,
  };
}

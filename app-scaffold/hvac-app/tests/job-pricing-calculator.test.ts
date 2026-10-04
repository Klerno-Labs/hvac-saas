import { describe, expect, it } from "vitest";
import { calculateJobPricing, JOB_PRICING_LIMITS, type JobPricingInputs } from "@/lib/job-pricing-calculator";

const inputs: JobPricingInputs = { materials: 250, laborHours: 4, hourlyLaborCost: 40, overhead: 90, targetGrossMargin: 40 };

describe("HVAC job pricing calculator", () => {
  it("distinguishes gross margin, markup and money left after overhead", () => {
    const result = calculateJobPricing(inputs)!;
    expect(result.laborCost).toBe(160);
    expect(result.directCost).toBe(410);
    expect(result.breakEvenPrice).toBe(500);
    expect(result.suggestedPrice).toBe(683.34);
    expect(result.grossProfit).toBe(273.34);
    expect(result.afterOverhead).toBe(183.34);
    expect(result.actualGrossMargin).toBeGreaterThanOrEqual(40);
    expect(result.actualGrossMargin).toBeCloseTo(40, 2);
    expect(result.markup).toBeCloseTo(66.6683, 4);
    expect(result.overheadRaisesPrice).toBe(false);
  });

  it("raises the suggestion to cover allocated overhead without labeling it gross profit", () => {
    const result = calculateJobPricing({ ...inputs, overhead: 500 })!;
    expect(result.targetMarginPrice).toBe(683.34);
    expect(result.suggestedPrice).toBe(910);
    expect(result.grossProfit).toBe(500);
    expect(result.afterOverhead).toBe(0);
    expect(result.actualGrossMargin).toBeGreaterThan(40);
    expect(result.overheadRaisesPrice).toBe(true);
  });

  it("handles zero target margin and zero-cost jobs without NaN or division by zero", () => {
    expect(calculateJobPricing({ ...inputs, targetGrossMargin: 0 })?.suggestedPrice).toBe(500);
    const zero = calculateJobPricing({ materials: 0, laborHours: 0, hourlyLaborCost: 0, overhead: 0, targetGrossMargin: 40 })!;
    expect(zero.suggestedPrice).toBe(0);
    expect(zero.markup).toBeNull();
    expect(zero.actualGrossMargin).toBeNull();
    const overheadOnly = calculateJobPricing({ materials: 0, laborHours: 0, hourlyLaborCost: 0, overhead: 50, targetGrossMargin: 40 })!;
    expect(overheadOnly.suggestedPrice).toBe(50);
    expect(overheadOnly.markup).toBeNull();
    expect(overheadOnly.actualGrossMargin).toBe(100);
  });

  it("uses all technician hours and rounds fractional labor cost to cents", () => {
    const result = calculateJobPricing({ ...inputs, materials: 0, laborHours: 6.25, hourlyLaborCost: 32.19, overhead: 0, targetGrossMargin: 0 })!;
    expect(result.laborCost).toBe(201.19);
    expect(result.suggestedPrice).toBe(201.19);
    expect(calculateJobPricing({ ...inputs, laborHours: 1.5, hourlyLaborCost: 0.67 })?.laborCost).toBe(1.01);
  });

  it("rounds prices upward without adding a cent to an exact price", () => {
    expect(calculateJobPricing({ ...inputs, materials: 0.01, laborHours: 0, overhead: 0, targetGrossMargin: 40 })?.suggestedPrice).toBe(0.02);
    expect(calculateJobPricing({ ...inputs, materials: 400, laborHours: 0, overhead: 0, targetGrossMargin: 20 })?.suggestedPrice).toBe(500);
    expect(calculateJobPricing({ ...inputs, materials: 400, laborHours: 0, overhead: 0, targetGrossMargin: 40 })?.suggestedPrice).toBe(666.67);
  });

  it("accepts the documented upper bounds and rejects invalid input in every field", () => {
    expect(calculateJobPricing({ ...JOB_PRICING_LIMITS })).not.toBeNull();
    for (const key of Object.keys(inputs) as (keyof JobPricingInputs)[]) {
      for (const value of [-1, NaN, Infinity, -Infinity, JOB_PRICING_LIMITS[key] + 1]) {
        expect(calculateJobPricing({ ...inputs, [key]: value }), `${key}: ${value}`).toBeNull();
      }
    }
  });

  it("never undercuts target margin or entered-cost break-even for positive-cost jobs", () => {
    for (const directCost of [0.01, 0.07, 1.23, 40, 400, 1999.99, 1_000_000]) {
      for (const targetGrossMargin of [0, 1, 12.5, 30, 40, 50, 75, 98.9, 99]) {
        const result = calculateJobPricing({ ...inputs, materials: directCost, laborHours: 0, overhead: 10.01, targetGrossMargin })!;
        expect(result.actualGrossMargin! + 1e-10).toBeGreaterThanOrEqual(targetGrossMargin);
        expect(result.suggestedPrice).toBeGreaterThanOrEqual(result.breakEvenPrice);
        expect(result.afterOverhead).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

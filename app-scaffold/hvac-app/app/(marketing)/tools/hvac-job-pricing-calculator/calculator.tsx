"use client";

import { useState } from "react";
import { calculateJobPricing, JOB_PRICING_LIMITS, type JobPricingInputs } from "@/lib/job-pricing-calculator";
import styles from "./calculator.module.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fields = [
  { key: "materials", label: "Materials and equipment cost ($)", hint: "Your purchase cost for parts, equipment, consumables and other direct job expenses.", step: "0.01" },
  { key: "laborHours", label: "Total technician labor hours", hint: "Add the hours for every technician: two people for three hours is six labor hours.", step: "0.25" },
  { key: "hourlyLaborCost", label: "Your labor cost per hour ($)", hint: "Wages plus employer payroll costs and benefits. Use a weighted average for different technician costs. Enter your cost, not your customer billing rate.", step: "0.01" },
  { key: "overhead", label: "Overhead allocated to this job ($)", hint: "Your share of rent, vehicles, office staff and other indirect costs. Do not count costs already included above.", step: "0.01" },
  { key: "targetGrossMargin", label: "Target gross margin (%)", hint: "Gross profit as a percentage of the selling price, before allocated overhead. Choose your own target; 40% is an example, not an industry benchmark.", step: "0.1" },
] as const;
const initialValues = { materials: "250", laborHours: "4", hourlyLaborCost: "40", overhead: "90", targetGrossMargin: "40" };

export default function JobPricingCalculator() {
  const [values, setValues] = useState(initialValues);
  const invalidFields = fields.filter(({ key }) => !values[key].trim() || !Number.isFinite(Number(values[key])) || Number(values[key]) < 0 || Number(values[key]) > JOB_PRICING_LIMITS[key]);
  const inputs = Object.fromEntries(fields.map(({ key }) => [key, Number(values[key])])) as JobPricingInputs;
  const result = invalidFields.length ? null : calculateJobPricing(inputs);

  return (
    <section className={styles.calculator} aria-label="HVAC job pricing calculator">
      <div className={styles.inputs}>
        <div className={styles.inputIntro}>
          <h2>Your job costs</h2>
          <p>Example inputs are shown. Change them to match one job. Calculations stay in your browser.</p>
        </div>
        {fields.map(({ key, label, hint, step }) => {
          const invalid = invalidFields.some((field) => field.key === key);
          return (
            <div key={key}>
              <label htmlFor={`pricing-${key}`}>{label}</label>
              <p id={`pricing-${key}-hint`} className={styles.hint}>{hint}</p>
              <input
                id={`pricing-${key}`}
                type="number"
                min="0"
                max={JOB_PRICING_LIMITS[key]}
                step={step}
                inputMode="decimal"
                value={values[key]}
                aria-describedby={`pricing-${key}-hint${invalid ? ` pricing-${key}-error` : ""}`}
                aria-invalid={invalid}
                onChange={(event) => setValues((previous) => ({ ...previous, [key]: event.target.value }))}
              />
              {invalid && <p id={`pricing-${key}-error`} className={styles.error}>Enter a number from 0 to {JOB_PRICING_LIMITS[key].toLocaleString("en-US")}.</p>}
            </div>
          );
        })}
        <button className={styles.reset} type="button" onClick={() => setValues(initialValues)}>Reset example</button>
      </div>
      <div className={styles.results} aria-live="polite" aria-atomic="true">
        {result ? (
          <>
            <p className={styles.resultLabel}>Suggested pretax job price</p>
            <strong className={styles.price}>{money.format(result.suggestedPrice)}</strong>
            <p className={styles.resultNote}>The higher of your target-margin price and break-even price. Review the scope and your actual costs before quoting.</p>
            {result.overheadRaisesPrice && <p className={styles.notice}>Your allocated overhead requires a higher price than the margin target alone. This suggestion covers entered costs, with nothing left after that overhead.</p>}
            {result.directCost === 0 && <p className={styles.notice}>No direct job cost is entered. Markup cannot be calculated, and the margin percentage is not a useful pricing target until you add your costs.</p>}
            <dl className={styles.breakdown}>
              <div><dt>Materials and equipment</dt><dd>{money.format(result.materials)}</dd></div>
              <div><dt>Total labor cost</dt><dd>{money.format(result.laborCost)}</dd></div>
              <div className={styles.subtotal}><dt>Direct job cost</dt><dd>{money.format(result.directCost)}</dd></div>
              <div><dt>Allocated overhead</dt><dd>{money.format(result.overhead)}</dd></div>
              <div><dt>Break-even on entered costs</dt><dd>{money.format(result.breakEvenPrice)}</dd></div>
              <div><dt>Price at your margin target</dt><dd>{money.format(result.targetMarginPrice)}</dd></div>
            </dl>
            <div className={styles.percentages}>
              <div><span>Gross margin on suggested price</span><strong>{result.actualGrossMargin === null ? "N/A" : `${result.actualGrossMargin.toFixed(1)}%`}</strong></div>
              <div><span>Markup on direct job cost</span><strong>{result.markup === null ? "N/A" : `${result.markup.toFixed(1)}%`}</strong></div>
            </div>
            <dl className={styles.breakdown}>
              <div><dt>Gross profit before overhead</dt><dd>{money.format(result.grossProfit)}</dd></div>
              <div><dt>Amount left after allocated overhead</dt><dd>{money.format(result.afterOverhead)}</dd></div>
            </dl>
            <p className={styles.resultNote}>Figures are in USD. Tax, payment processing fees, financing fees and costs you have not entered are excluded. The amount left is not a forecast of business net profit.</p>
          </>
        ) : <div><h2>Check your inputs</h2><p>Complete all five fields within the shown limits to calculate a price. Gross margin must be between 0% and 99%.</p></div>}
      </div>
    </section>
  );
}

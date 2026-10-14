"use client";
import { useState } from "react";
import { estimateAdminTime } from "@/lib/self-service-tools";
import { trackPublicFunnel } from "@/lib/track-public-funnel";
import styles from "./calculator.module.css";
export default function PaperworkCalculator() {
  const [values, setValues] = useState(["20", "15", "10"]);
  const result = values.some((v) => !v.trim())
    ? null
    : estimateAdminTime(...(values.map(Number) as [number, number, number]));
  const labels = [
    "Jobs per week",
    "Current paperwork minutes per job",
    "Your target minutes per job",
  ];
  return (
    <section className={styles.calculator} aria-label="Paperwork calculator">
      <div className={styles.inputs}>
        <p>Example inputs are shown. Change them to match your business.</p>
        {labels.map((label, index) => (
          <div key={label}>
            <label htmlFor={`time-input-${index}`}>{label}</label>
            <input
              id={`time-input-${index}`}
              type="number"
              min="0"
              max={index === 0 ? 1000 : 240}
              step={index === 0 ? 1 : 0.5}
              inputMode="decimal"
              value={values[index]}
              onChange={(event) =>
                setValues(
                  values.map((v, i) => (i === index ? event.target.value : v)),
                )
              }
              onBlur={() => trackPublicFunnel("calculator_used")}
            />
          </div>
        ))}
      </div>
      <div className={styles.result} aria-live="polite" aria-atomic="true">
        {result ? (
          <>
            <p>Monthly time at your current pace</p>
            <strong>
              {result.hoursPerMonth.toFixed(1)} <small>hours</small>
            </strong>
            <hr />
            <p>
              {result.changeHoursPerMonth >= 0
                ? "Time you aim to recover each month"
                : "Additional time at your target"}
            </p>
            <strong>
              {Math.abs(result.changeHoursPerMonth).toFixed(1)}{" "}
              <small>hours</small>
            </strong>
            <span>If your target is achieved. No guaranteed savings.</span>
          </>
        ) : (
          <p>
            Enter 0–1,000 whole jobs and 0–240 minutes in each time field to see
            your estimate.
          </p>
        )}
      </div>
    </section>
  );
}

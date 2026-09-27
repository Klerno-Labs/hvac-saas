import Link from "next/link";
import { siteUrl, signupUrl } from "@/lib/marketing/site";
import PaperworkCalculator from "./calculator";
import styles from "./calculator.module.css";
export const metadata = {
  title: "Paperwork time calculator for service businesses",
  description:
    "Estimate how much time your service business spends on job paperwork and set your own target for reducing it. Free calculator, no signup required.",
  alternates: { canonical: `${siteUrl}/tools/paperwork-calculator` },
};
export default function CalculatorPage() {
  return (
    <main
      id="marketing-content"
      tabIndex={-1}
      className={`shell ${styles.page}`}
    >
      <header className="page-heading">
        <p className="eyebrow">A clearer picture of your week</p>
        <h1>
          What does paperwork
          <br />
          take out of your day?
        </h1>
        <p>
          Use your own workload to set a goal for the office time around each
          job.
        </p>
      </header>
      <PaperworkCalculator />
      <section className={styles.explanation}>
        <h2>Make the estimate useful.</h2>
        <ol>
          <li>
            <strong>Count your actual jobs.</strong> Use an average week,
            including the busy and quiet days.
          </li>
          <li>
            <strong>Time the paperwork.</strong> Include preparing estimates,
            copying job details, sending invoices and checking their status.
          </li>
          <li>
            <strong>Choose a target.</strong> Try the workflow with a few jobs,
            then replace your assumptions with what you measured.
          </li>
        </ol>
        <p>
          This is a planning tool. Your target is an assumption, not a measured
          FieldClose result or a promise of savings. Calculation: jobs per week
          × minutes per job × 52 ÷ 12 ÷ 60.
        </p>
      </section>
      <div className={styles.cta}>
        <div>
          <h2>See the workflow for yourself.</h2>
          <p>
            Walk through a sample estimate, approval and payment before creating
            an account.
          </p>
        </div>
        <div>
          <Link className="button secondary" href="/demo">
            Try the product tour
          </Link>
          <a className="button" href={signupUrl}>
            Start free trial
          </a>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { requirePageCapability } from "@/lib/session";
import CustomerImportForm from "./customer-form";
export const metadata = {
  title: "Import customers",
  robots: { index: false, follow: false },
};
export default async function CustomerImportPage() {
  await requirePageCapability("manageCustomers");
  return (
    <main className="workspace-page max-w-4xl!">
      <div className="workspace-heading">
        <div>
          <p className="workspace-kicker">Bring your records with you</p>
          <h1>Import customers</h1>
          <p>
            Match your columns, review the results, then choose what to add.
          </p>
        </div>
      </div>
      <div className="workspace-panel p-6">
        <CustomerImportForm />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Existing records are never overwritten. Matching emails are skipped,
        including archived customers. An unchanged completed batch can be
        retried safely. If you edit a file to fix skipped rows, remove
        previously imported rows without an email first: they cannot be matched
        to existing customers and would be added again. Importing does not send
        messages.
      </p>
      <div className="mt-6 flex gap-5 flex-wrap">
        <Link href="/setup" className="underline">
          Back to setup
        </Link>
        <Link href="/help/team-and-imports" className="underline">
          Import guide
        </Link>
        <Link href="/pricebook/import" className="underline">
          Import service prices instead
        </Link>
      </div>
    </main>
  );
}

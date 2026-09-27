"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireMutationAccess } from "@/lib/mutation-access";
import { trackEvent } from "@/lib/events";
import { logAudit } from "@/lib/audit";
import {
  prepareCustomerImport,
  partitionCustomerImport,
  type CustomerImportInput,
  type CustomerImportReport,
} from "@/lib/customer-import";

type Result =
  | { success: true; report: CustomerImportReport }
  | { success: false; error: string };
export async function reviewCustomerImport(
  input: CustomerImportInput,
): Promise<Result> {
  const access = await requireMutationAccess("manageCustomers");
  if (!access.authorized) return { success: false, error: access.error };
  let prepared: ReturnType<typeof prepareCustomerImport>;
  try {
    prepared = prepareCustomerImport(input);
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  try {
    const existing = await db.customer.findMany({
      where: {
        organizationId: access.context.organizationId,
        email: {
          in: prepared.valid
            .map((row) => row.data.email)
            .filter((email): email is string => Boolean(email)),
          mode: "insensitive",
        },
      },
      select: { email: true },
    });
    return {
      success: true,
      report: partitionCustomerImport(prepared, existing).report,
    };
  } catch {
    return {
      success: false,
      error:
        "We could not check your customers. No records were changed. Try again when the connection returns.",
    };
  }
}

export async function saveCustomerImport(
  input: CustomerImportInput,
): Promise<Result> {
  const access = await requireMutationAccess("manageCustomers");
  if (!access.authorized) return { success: false, error: access.error };
  let prepared: ReturnType<typeof prepareCustomerImport>;
  try {
    prepared = prepareCustomerImport(input);
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
  const { organizationId, userId } = access.context;
  // A receipt is committed with the batch. Retrying the same normalized rows cannot import twice.
  const digest = createHash("sha256")
    .update(JSON.stringify(prepared))
    .digest("hex");
  try {
    const report = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
      const receipt = await tx.activityEvent.findFirst({
        where: {
          organizationId,
          eventName: "customer_import_completed",
          entityId: digest,
        },
        select: { metadataJson: true },
      });
      if (receipt)
        return {
          ...(receipt.metadataJson as unknown as CustomerImportReport),
          alreadyImported: true,
        };
      const existing = await tx.customer.findMany({
        where: {
          organizationId,
          email: {
            in: prepared.valid
              .map((row) => row.data.email)
              .filter((email): email is string => Boolean(email)),
            mode: "insensitive",
          },
        },
        select: { email: true },
      });
      const { creates, report } = partitionCustomerImport(prepared, existing);
      if (!creates.length) return report;
      await tx.customer.createMany({
        data: creates.map(({ data }) => ({
          ...data,
          organizationId,
          email: data.email || null,
        })),
      });
      await trackEvent(
        {
          organizationId,
          userId,
          eventName: "customer_import_completed",
          entityType: "customer_import",
          entityId: digest,
          metadataJson: report,
        },
        tx,
      );
      await logAudit(
        {
          organizationId,
          actorId: userId,
          eventType: "customer_import_completed",
          targetType: "customer_import",
          targetId: digest,
          metadata: {
            created: report.created,
            duplicates: report.duplicates,
            invalid: report.invalid,
          },
        },
        tx,
      );
      return report;
    });
    revalidatePath("/customers");
    revalidatePath("/setup");
    revalidatePath("/dashboard");
    return { success: true, report };
  } catch {
    return {
      success: false,
      error:
        "The import could not be confirmed. Retry this same file safely; a completed batch will not be added twice.",
    };
  }
}

"use server";

import { requireMutationAccess } from "@/lib/mutation-access";
import { db } from "@/lib/db";
import { trackEvent } from "@/lib/events";
import { createPriceBookItemSchema } from "@/lib/validations/pricebook";
import { revalidatePath } from "next/cache";

type CreateResult =
  | { success: true; itemId: string }
  | { success: false; error: string };

export async function createPriceBookItem(
  formData: FormData,
): Promise<CreateResult> {
  const access = await requireMutationAccess("editPricing");
  if (!access.authorized) return { success: false, error: access.error };
  const { userId, organizationId } = access.context;

  const price = String(formData.get("flatPrice") ?? "").trim();
  const cost = String(formData.get("cost") ?? "").trim();
  if (
    !/^\d+(\.\d{1,2})?$/.test(price) ||
    (cost && !/^\d+(\.\d{1,2})?$/.test(cost))
  ) {
    return {
      success: false,
      error: "Enter a price and optional cost with up to two decimal places.",
    };
  }

  const raw = {
    name: formData.get("name"),
    category: formData.get("category") || undefined,
    description: formData.get("description") || undefined,
    flatPriceCents: Math.round(Number(price) * 100),
    costCents: cost ? Math.round(Number(cost) * 100) : undefined,
    imageUrl: formData.get("imageUrl") || undefined,
  };

  const parsed = createPriceBookItemSchema.safeParse(raw);
  if (!parsed.success)
    return { success: false, error: parsed.error.errors[0].message };

  const data = parsed.data;
  try {
    const item = await db.$transaction(async (tx) => {
      const created = await tx.priceBookItem.create({
        data: {
          organizationId,
          name: data.name,
          category: data.category || null,
          description: data.description || null,
          flatPriceCents: data.flatPriceCents,
          costCents: data.costCents ?? null,
          imageUrl: data.imageUrl || null,
        },
      });

      await trackEvent(
        {
          organizationId,
          userId,
          eventName: "pricebook_item_created",
          entityType: "pricebook_item",
          entityId: created.id,
        },
        tx,
      );
      return created;
    });

    revalidatePath("/pricebook");
    revalidatePath("/setup");
    revalidatePath("/dashboard");
    return { success: true, itemId: item.id };
  } catch {
    return {
      success: false,
      error:
        "We could not confirm the new item. Check your price book before trying again.",
    };
  }
}

"use server";

import { db } from "@/lib/db";
import { trackEvent } from "@/lib/events";
import { signupSchema } from "@/lib/validations/auth";
import { cookies, headers } from "next/headers";
import bcrypt from "bcryptjs";
import { isTradeId } from "@/lib/trades";
import { parseSignupAcquisition, type AcquisitionMetadata } from "@/lib/acquisition-attribution";

type SignupResult = { success: true } | { success: false; error: string };

export async function signup(formData: FormData): Promise<SignupResult> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  const { name, email, password } = parsed.data;

  // Optional, untrusted measurement. It must never change account creation or entitlements.
  let acquisition: AcquisitionMetadata | null = null;
  const acquisitionInput = formData.get("acquisition");
  if (typeof acquisitionInput === "string" && acquisitionInput.length <= 512) {
    try {
      const requestHeaders = await headers();
      if (requestHeaders.get("dnt") !== "1" && requestHeaders.get("sec-gpc") !== "1") {
        acquisition = parseSignupAcquisition(acquisitionInput);
      }
    } catch { /* Ignore unavailable request context or malformed attribution. */ }
  }

  // Persist referral code from form (passed via hidden input) into a cookie
  // that survives until onboarding completes
  const ref = formData.get("ref");
  if (typeof ref === "string" && ref.length > 0 && ref.length < 100) {
    const cookieStore = await cookies();
    cookieStore.set("fc_ref", ref, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }

  try {
    const existing = await db.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (existing) {
      return {
        success: false,
        error: "An account with this email already exists",
      };
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          hashedPassword,
        },
      });

      await trackEvent(
        {
          userId: created.id,
          eventName: "user_signed_up",
          entityType: "user",
          entityId: created.id,
          ...(acquisition ? { metadataJson: { acquisition } } : {}),
        },
        tx,
      );
      return created;
    });

    const requestedTrade = formData.get("trade");
    const cookieStore = await cookies();
    cookieStore.set(
      "fc_trade",
      isTradeId(requestedTrade) ? requestedTrade : "hvac",
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      },
    );

    cookieStore.set(
      "fc_plan",
      formData.get("plan") === "pro" ? "pro" : "starter",
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      },
    );

    return { success: true };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    )
      return {
        success: false,
        error: "An account with this email already exists. Log in to continue.",
      };
    return {
      success: false,
      error:
        "Account creation is temporarily unavailable. Try again shortly, or log in if you already submitted this form.",
    };
  }
}

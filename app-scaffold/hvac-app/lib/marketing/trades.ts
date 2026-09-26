/** Trade copy is configuration; shared layout, trust controls and workflows stay identical. */
export const tradeProfiles = {
  hvac: {
    id: "hvac",
    name: "HVAC",
    audience: "HVAC shops",
    service: "Seasonal HVAC inspection",
    serviceDetail: "Residential service",
    recordLabel: "Customer records and equipment history",
    description:
      "Estimates, jobs, invoices, and payments for HVAC contractors.",
    keywords: ["HVAC software", "HVAC estimates", "HVAC invoicing"],
  },
  plumbing: {
    id: "plumbing",
    name: "Plumbing",
    audience: "plumbing teams",
    service: "Plumbing service visit",
    serviceDetail: "Residential service",
    recordLabel: "Customer records and service history",
    description:
      "Estimates, jobs, invoices, and payments for plumbing businesses.",
    keywords: ["plumbing software", "plumber estimates", "plumbing invoicing"],
  },
  electrical: {
    id: "electrical",
    name: "Electrical",
    audience: "electrical contractors",
    service: "Electrical service visit",
    serviceDetail: "Residential service",
    recordLabel: "Customer records and service history",
    description:
      "Estimates, jobs, invoices, and payments for electrical contractors.",
    keywords: [
      "electrician software",
      "electrical estimates",
      "electrician invoicing",
    ],
  },
  "pest-control": {
    id: "pest-control",
    name: "Pest control",
    audience: "pest control teams",
    service: "Pest service visit",
    serviceDetail: "Residential service",
    recordLabel: "Customer records and visit history",
    description:
      "Customers, service visits, estimates, invoices, and payments for pest control teams.",
    keywords: [
      "pest control software",
      "pest control invoicing",
      "service visit scheduling",
    ],
  },
  "general-service": {
    id: "general-service",
    name: "Field service",
    audience: "service businesses",
    service: "Scheduled service visit",
    serviceDetail: "Customer service",
    recordLabel: "Customer records and service history",
    description:
      "Customers, jobs, estimates, invoices, and payments for service businesses.",
    keywords: [
      "field service software",
      "contractor estimates",
      "service invoicing",
    ],
  },
} as const;
export type TradeId = keyof typeof tradeProfiles;
export function getTradeProfile(value: string | undefined) {
  const id = value || "hvac";
  if (!Object.hasOwn(tradeProfiles, id))
    throw new Error(
      `Unsupported service trade: ${id}. Choose ${Object.keys(tradeProfiles).join(", ")}.`,
    );
  return tradeProfiles[id as TradeId];
}
export const serviceTrade = getTradeProfile(
  process.env.NEXT_PUBLIC_SERVICE_TRADE,
);
export function signupLink(
  productOrigin: string,
  tradeId: TradeId,
  plan?: string,
) {
  const url = new URL("/signup", productOrigin);
  url.searchParams.set("trade", tradeId);
  if (plan) url.searchParams.set("plan", plan);
  return url.toString();
}

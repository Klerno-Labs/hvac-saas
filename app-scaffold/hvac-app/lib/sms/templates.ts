export const TEMPLATE_IDS = ["collection_reminder", "appointment_reminder"] as const;
export type SmsTemplateId = (typeof TEMPLATE_IDS)[number];
export type SmsTemplateVars = Record<string, string>;

const STOP_FOOTER = "\n\nReply STOP to opt out.";

const TEMPLATES: Record<SmsTemplateId, string> = {
  collection_reminder:
    "Hi {{customerName}}, invoice #{{invoiceNumber}} for {{amount}} from {{orgName}} is past due.",
  appointment_reminder:
    "Hi {{customerName}}, reminder: appointment with {{orgName}} on {{date}} at {{time}}.",
};

export function renderTemplate(templateId: SmsTemplateId, vars: SmsTemplateVars): string {
  let body = TEMPLATES[templateId];
  for (const [k, v] of Object.entries(vars)) {
    body = body.replaceAll(`{{${k}}}`, v);
  }
  return body + STOP_FOOTER;
}

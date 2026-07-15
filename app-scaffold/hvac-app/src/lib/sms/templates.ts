import "server-only";

export type SmsTemplateId = "reminder" | "confirmation" | "on_my_way";

export interface SmsTemplateVars {
  customerName?: string;
  companyName: string;
  jobDate?: string;
  jobTimeWindow?: string;
  techName?: string;
  etaMinutes?: number;
}

const OPT_OUT_FOOTER = " Reply STOP to opt out.";

export function renderTemplate(id: SmsTemplateId, vars: SmsTemplateVars): string {
  const greeting = vars.customerName ? `Hi ${vars.customerName}, ` : "";

  let body: string;

  switch (id) {
    case "reminder": {
      const when = vars.jobDate
        ? vars.jobTimeWindow
          ? `on ${vars.jobDate} between ${vars.jobTimeWindow}`
          : `on ${vars.jobDate}`
        : "soon";
      body = `${greeting}${vars.companyName}: your appointment is scheduled ${when}.`;
      break;
    }
    case "confirmation": {
      const when = vars.jobDate
        ? vars.jobTimeWindow
          ? `on ${vars.jobDate} between ${vars.jobTimeWindow}`
          : `on ${vars.jobDate}`
        : "soon";
      body = `${greeting}Your appointment with ${vars.companyName} is confirmed ${when}.`;
      break;
    }
    case "on_my_way": {
      const from = vars.techName
        ? `${vars.techName} from ${vars.companyName}`
        : `Your ${vars.companyName} technician`;
      const eta = vars.etaMinutes !== undefined ? ` ETA: ${vars.etaMinutes} min.` : "";
      body = `${greeting}${from} is on the way.${eta}`;
      break;
    }
    default: {
      const _id = id as string;
      throw new Error(`Unknown SMS template id: "${_id}"`);
    }
  }

  return body + OPT_OUT_FOOTER;
}

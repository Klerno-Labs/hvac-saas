import "server-only"

export type SmsTemplateId = "reminder" | "confirmation" | "on_my_way"

export interface SmsTemplateVars {
  customerName?: string
  companyName: string
  jobDate?: string
  jobTimeWindow?: string
  techName?: string
  etaMinutes?: number
}

const STOP_FOOTER = " Reply STOP to opt out."

export function renderTemplate(id: SmsTemplateId, vars: SmsTemplateVars): string {
  const greeting = vars.customerName ? `Hi ${vars.customerName}, ` : ""

  let body: string
  switch (id) {
    case "reminder": {
      const when = [vars.jobDate, vars.jobTimeWindow].filter(Boolean).join(" ")
      const whenPart = when ? ` on ${when}` : ""
      body = `${greeting}your ${vars.companyName} appointment${whenPart} is coming up.`
      break
    }
    case "confirmation": {
      const when = [vars.jobDate, vars.jobTimeWindow].filter(Boolean).join(" ")
      const whenPart = when ? ` for ${when}` : ""
      body = `${greeting}your booking with ${vars.companyName} is confirmed${whenPart}.`
      break
    }
    case "on_my_way": {
      const tech = vars.techName ? ` ${vars.techName}` : ""
      const eta = vars.etaMinutes != null ? ` in ~${vars.etaMinutes} min` : ""
      body = `${greeting}your ${vars.companyName} tech${tech} is on the way${eta}.`
      break
    }
    default: {
      const _id: never = id
      throw new Error(`Unknown SMS template id: "${String(_id)}"`)
    }
  }

  return body + STOP_FOOTER
}

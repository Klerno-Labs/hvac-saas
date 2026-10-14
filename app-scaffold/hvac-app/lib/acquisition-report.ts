/** Operator-only aggregate reporting. This module never returns individual records. */
export type AcquisitionAttribution = {
  version: 1
  landingPath: string
  source: string
}

type AttributionParser = (value: unknown) => AcquisitionAttribution | null
export type AcquisitionReportEvent = { eventName: string; acquisition: unknown }
export type AcquisitionReportGroup = {
  attribution: 'attributed' | 'unassigned'
  landingPath: string | null
  source: string | null
  signupEvents: number
  onboardingEvents: number
}
export const ACQUISITION_REPORT_LIMIT = 50_000

export function aggregateAcquisitionEvents(events: AcquisitionReportEvent[], parseAttribution: AttributionParser) {
  if (events.length > ACQUISITION_REPORT_LIMIT) throw new Error('Report event limit exceeded. Use a shorter date window.')
  const groups = new Map<string, AcquisitionReportGroup>()
  let signupEvents = 0
  let onboardingEvents = 0
  for (const event of events) {
    if (event.eventName !== 'user_signed_up' && event.eventName !== 'organization_onboarding_completed') continue
    const acquisition = parseAttribution(event.acquisition)
    const key = acquisition ? JSON.stringify([acquisition.landingPath, acquisition.source]) : 'unassigned'
    const group = groups.get(key) ?? {
      attribution: acquisition ? 'attributed' : 'unassigned',
      landingPath: acquisition?.landingPath ?? null,
      source: acquisition?.source ?? null,
      signupEvents: 0,
      onboardingEvents: 0,
    }
    if (event.eventName === 'user_signed_up') { group.signupEvents += 1; signupEvents += 1 }
    else { group.onboardingEvents += 1; onboardingEvents += 1 }
    groups.set(key, group)
  }
  const grouped = [...groups.values()].sort((a, b) =>
    (b.signupEvents + b.onboardingEvents) - (a.signupEvents + a.onboardingEvents)
    || (a.landingPath ?? '').localeCompare(b.landingPath ?? '')
    || (a.source ?? '').localeCompare(b.source ?? ''))
  return { signupEvents, onboardingEvents, groups: grouped }
}

export type AcquisitionReportOptions = {
  help: boolean
  allTenants: boolean
  format: 'table' | 'json'
  days: number
  start: Date
  end: Date
}

export function parseAcquisitionReportOptions(args: string[], now = new Date()): AcquisitionReportOptions {
  let days = 28
  let end = new Date(now)
  let format: 'table' | 'json' = 'table'
  let allTenants = false
  let help = false
  const seen = new Set<string>()
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (seen.has(flag)) throw new Error('Each report option may be specified only once.')
    seen.add(flag)
    if (flag === '--help') { help = true; continue }
    if (flag === '--all-tenants') { allTenants = true; continue }
    if (!['--days', '--end', '--format'].includes(flag)) throw new Error('Unknown report option. Use --help.')
    const value = args[++index]
    if (!value) throw new Error('Missing report option value. Use --help.')
    if (flag === '--days') {
      if (!/^[1-9]\d?$/.test(value) || Number(value) > 90) throw new Error('--days must be an integer from 1 to 90.')
      days = Number(value)
    }
    if (flag === '--end') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('--end must be a valid YYYY-MM-DD date, exclusive at 00:00 UTC.')
      end = new Date(`${value}T00:00:00.000Z`)
      if (!Number.isFinite(end.getTime()) || end.toISOString().slice(0, 10) !== value) throw new Error('--end must be a valid YYYY-MM-DD date, exclusive at 00:00 UTC.')
    }
    if (flag === '--format') {
      if (value !== 'table' && value !== 'json') throw new Error('--format must be table or json.')
      format = value
    }
  }
  if (!Number.isFinite(end.getTime())) throw new Error('Invalid report clock.')
  return { help, allTenants, format, days, start: new Date(end.getTime() - days * 86_400_000), end }
}

export function formatAcquisitionReport(report: ReturnType<typeof aggregateAcquisitionEvents>, start: Date, end: Date) {
  const lines = [
    'FieldClose acquisition event report — all tenants',
    `UTC window: ${start.toISOString()} inclusive to ${end.toISOString()} exclusive`,
    `Signup events: ${report.signupEvents}; onboarding completion events: ${report.onboardingEvents}`,
    'These are recorded events, not visitors, unique companies, conversion rates or paid customers.',
    'Onboarding uses the earliest preceding signup attribution, including signups before this window.',
    '',
    'Attribution\tLanding path\tCoarse source\tSignup events\tOnboarding events',
  ]
  for (const group of report.groups) lines.push([
    group.attribution,
    group.landingPath ?? '(unassigned)',
    group.source ?? '(legacy, missing or invalid attribution)',
    group.signupEvents,
    group.onboardingEvents,
  ].join('\t'))
  if (!report.groups.length) lines.push('No matching events in this window.')
  return lines.join('\n')
}

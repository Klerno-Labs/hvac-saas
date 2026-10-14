import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { mkdir, writeFile, statfs } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'

export const output = process.env.SIM_OUTPUT || '/tmp/fieldclose-stress-20260927'
export function guardedUrl() {
  const u = new URL(process.env.SIM_DATABASE_URL || '')
  assert.equal(u.hostname, '127.0.0.1'); assert.equal(u.port, '56487')
  assert.equal(u.pathname, '/fieldclose_three_year_20260927_test')
  u.searchParams.set('connection_limit', '20'); u.searchParams.set('pool_timeout', '15')
  return u.toString()
}
export const companyId = n => `sim-org-${String(n).padStart(2, '0')}`
export const employeeId = (n, e) => `sim-user-${n}-${e}`
export const customerId = (n, c) => `sim-customer-${n}-${c}`
export const marker = n => `TENANT_${String(n).padStart(2, '0')}_PRIVATE`
const day = 86400000
const isoMonth = d => d.toISOString().slice(0, 7)

export async function seed(db) {
  assert.equal(await db.organization.count(), 0, 'Seed refuses a nonempty database')
  assert.equal(await db.user.count(), 0)
  const disk = await statfs(output)
  assert.ok(disk.bavail * disk.bsize > 6 * 1024 ** 3, 'At least 6 GiB free required')
  const report = { methodology: 'Deterministic bulk historical backfill, not browser-replayed history; actual HTTP workflows are measured separately.', start: '2023-09-27', end: '2026-09-26', companies: 10, employees: 100, technicians: 80, workdaysPerYear: 250, jobsPerTechnicianDay: 3, seed: 20260927, counts: {}, monthly: [], companiesExpected: [] }
  const dates = []
  for (let y = 2023; y <= 2025; y++) {
    const start = Date.UTC(y, 8, 27, 12), end = Date.UTC(y + 1, 8, 27, 12)
    const weekdays = []
    for (let t = start; t < end; t += day) if (![0, 6].includes(new Date(t).getUTCDay())) weekdays.push(new Date(t))
    // Spread 250 operating dates over each full simulation year, leaving holidays.
    for (let i = 0; i < 250; i++) dates.push(weekdays[Math.floor(i * weekdays.length / 250)])
  }
  assert.equal(dates.length, 750)
  const password = randomBytes(32).toString('base64url'), hashedPassword = await bcrypt.hash(password, 12)
  const put = async (model, rows) => {
    if (!rows.length) return
    for (let i = 0; i < rows.length; i += 500) await db[model].createMany({ data: rows.slice(i, i + 500) })
    report.counts[model] = (report.counts[model] || 0) + rows.length
  }
  for (let n = 0; n < 10; n++) {
    const org = companyId(n), tag = marker(n)
    await db.organization.create({ data: { id: org, name: `Simulation ${tag}`, plan: 'PRO', subscriptionStatus: 'ACTIVE', timezone: 'America/Chicago', onboardingStatus: 'completed', tradeType: ['hvac', 'plumbing', 'electrical', 'pest-control', 'general-service'][n % 5], stripeConnectedAccountId: `acct_simulation_${n}`, stripeChargesEnabled: true } })
    await put('user', Array.from({ length: 10 }, (_, e) => ({ id: employeeId(n,e), name: `${tag} employee ${e}`, email: `company${n}.employee${e}@simulation.example.test`, hashedPassword })))
    await put('organizationMember', Array.from({ length: 10 }, (_, e) => ({ organizationId: org, userId: employeeId(n,e), role: e === 0 ? 'owner' : e === 1 ? 'dispatcher' : 'technician' })))
    await put('customer', Array.from({ length: 2000 }, (_, c) => ({ id: customerId(n,c), organizationId: org, firstName: `${tag} Customer ${c}`, lastName: 'Synthetic', createdAt: new Date(Date.UTC(2023,8,27)), updatedAt: new Date(Date.UTC(2023,8,27)), deletedAt: c % 100 === 99 ? new Date('2026-01-01T00:00:00Z') : null })))
    const monthly = new Map(), expected = { organizationId: org, receivableCents: 0, collectedCents: 0, invoiceCents: 0 }
    const month = d => {
      const key = isoMonth(d)
      if (!monthly.has(key)) monthly.set(key, { organizationId: org, month: key, jobsCreated: 0, jobsCompleted: 0, estimatesCreated: 0, estimatesAccepted: 0, invoicedCents: 0, collectedCents: 0, outstandingCents: 0 })
      return monthly.get(key)
    }
    let sequence = 0
    for (let b = 0; b < dates.length; b += 25) {
      const rows = Object.fromEntries(['job','estimate','estimateLineItem','invoice','invoiceLineItem','payment','jobNote','activityEvent'].map(x => [x, []]))
      for (const date of dates.slice(b,b+25)) for (let tech = 2; tech < 10; tech++) for (let visit = 0; visit < 3; visit++) {
        const k = ++sequence, id = `sim-job-${n}-${k}`, est = `sim-est-${n}-${k}`, inv = `sim-inv-${n}-${k}`
        const at = new Date(date.getTime() + visit * 3 * 3600000), stamp = { createdAt: at, updatedAt: at }
        const canceled = k % 20 === 0, draft = k % 20 === 1, completed = !canceled && !draft
        const customer = customerId(n, (k * 37) % 2000), amount = 7500 + ((k * 7919 + n * 101) % 192500), tax = Math.round(amount * .07), total = amount + tax
        const unpaid = k % 13 === 0
        const m = month(at); m.jobsCreated++; m.estimatesCreated++; if (completed) { m.jobsCompleted++; m.estimatesAccepted++ }
        rows.job.push({ id, organizationId: org, customerId: customer, title: `${tag} Service ${k}`, status: canceled ? 'cancelled' : draft ? 'draft' : 'completed', assignedUserId: employeeId(n,tech), scheduledFor: at, completedAt: completed ? at : null, workSummary: completed ? `${tag} synthetic repair completed` : null, ...stamp })
        rows.estimate.push({ id: est, organizationId: org, jobId: id, estimateNumber: `EST-${String(k).padStart(5,'0')}`, status: canceled ? 'declined' : draft ? 'draft' : 'accepted', scopeOfWork: `${tag} service scope`, subtotalCents: amount, taxCents: tax, totalCents: total, acceptedAt: completed ? at : null, declinedAt: canceled ? at : null, ...stamp })
        rows.estimateLineItem.push({ estimateId: est, name: `${tag} Labor and materials`, quantity: 1, unitPriceCents: amount, lineTotalCents: amount })
        if (completed) {
          rows.invoice.push({ id: inv, organizationId: org, jobId: id, customerId: customer, sourceEstimateId: est, invoiceNumber: `INV-${String(k).padStart(5,'0')}`, status: unpaid ? 'overdue' : 'paid', subtotalCents: amount, taxCents: tax, totalCents: total, outstandingCents: unpaid ? total : 0, sentAt: at, dueDate: new Date(+at+30*day), paidAt: unpaid ? null : at, ...stamp })
          rows.invoiceLineItem.push({ invoiceId: inv, name: `${tag} Labor and materials`, quantity: 1, unitPriceCents: amount, lineTotalCents: amount })
          m.invoicedCents += total; expected.invoiceCents += total
          if (unpaid) { m.outstandingCents += total; expected.receivableCents += total }
          else { m.collectedCents += total; expected.collectedCents += total; rows.payment.push({ organizationId: org, invoiceId: inv, stripePaymentIntent: `pi_simulation_${n}_${k}`, amountCents: total, method: k % 2 ? 'checkout' : 'terminal', status: 'succeeded', paidAt: at, ...stamp }) }
          rows.jobNote.push({ clientId: `sim-note-${n}-${k}`, organizationId: org, jobId: id, authorId: employeeId(n,tech), authorName: `${tag} technician`, body: `${tag} arrival and completion recorded.`, ...stamp })
        }
        for (const eventName of ['job_created','estimate_created', completed ? 'job_completed' : 'job_updated']) rows.activityEvent.push({ organizationId: org, userId: employeeId(n,tech), eventName, entityType: 'job', entityId: id, createdAt: at })
      }
      for (const [model, data] of Object.entries(rows)) await put(model,data)
    }
    report.monthly.push(...monthly.values()); report.companiesExpected.push(expected)
    await writeFile(`${output}/fixture.json`, JSON.stringify(report,null,2))
    console.log(`History seeded: company ${n+1}/10, ${sequence} jobs, ${report.counts.job} total`)
  }
  // Separate present-day work keeps live field writes out of historical oracles.
  await put('job', Array.from({length:100},(_,i)=>({id:`sim-live-job-${i}`,organizationId:companyId(Math.floor(i/10)),customerId:customerId(Math.floor(i/10),0),title:`${marker(Math.floor(i/10))} Current service ${i}`,status:'scheduled',scheduledFor:new Date(),assignedUserId:employeeId(Math.floor(i/10),i%10)})))
  await db.$executeRawUnsafe('ANALYZE')
  report.counts.organization = 10
  report.databaseBytes = Number((await db.$queryRaw`SELECT pg_database_size(current_database()) AS bytes`)[0].bytes)
  await writeFile(`${output}/fixture.json`, JSON.stringify(report,null,2))
  return report
}

if (process.argv[2] === 'seed') {
  await mkdir(output,{recursive:true})
  const db = new PrismaClient({datasources:{db:{url:guardedUrl()}}})
  try { await seed(db) } finally { await db.$disconnect() }
}

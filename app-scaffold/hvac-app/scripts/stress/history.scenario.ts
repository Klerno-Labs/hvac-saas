import { it, expect, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

const url = new URL(process.env.SIM_DATABASE_URL || '')
if(url.hostname!=='127.0.0.1'||url.port!=='56487'||url.pathname!=='/fieldclose_three_year_20260927_test')throw Error('Exact isolated simulation database required')
url.searchParams.set('connection_limit','20')
process.env.DATABASE_URL=url.toString()
const {db}=await import('../../lib/db')
const {getOwnerAnalytics}=await import('../../lib/owner-analytics')
const dir=process.env.SIM_OUTPUT||'/tmp/fieldclose-stress-20260927'
const fixture=JSON.parse(await fs.readFile(`${dir}/fixture.json`,'utf8'))
const report:{checks:unknown[];monthly:unknown[];completed:boolean}={checks:[],monthly:[],completed:false}
afterAll(async()=>{await fs.writeFile(`${dir}/history-validation.json`,JSON.stringify(report,null,2));await db.$disconnect()})

it('all company/calendar-month analytics agree with independently generated history totals',async()=>{
  const failures:unknown[]=[]
  for(const m of fixture.monthly){
    const [y,month]=m.month.split('-').map(Number)
    const start=new Date(Date.UTC(y,month-1,1)),end=new Date(Math.min(Date.UTC(y,month,1)-1,Date.parse('2026-09-26T23:59:59.999Z')))
    const t=performance.now(),actual=await getOwnerAnalytics(m.organizationId,{start,end})
    const observed={invoicedCents:actual.revenue.invoicedCents,collectedCents:actual.revenue.collectedCents,outstandingCents:actual.revenue.outstandingCents,jobsCreated:actual.jobs.created,jobsCompleted:actual.jobs.completed,estimatesCreated:actual.estimates.created,estimatesAccepted:actual.estimates.accepted}
    const expected=Object.fromEntries(Object.keys(observed).map(k=>[k,m[k]]))
    const passed=JSON.stringify(observed)===JSON.stringify(expected)
    report.monthly.push({organization:m.organizationId,month:m.month,ms:performance.now()-t,passed,observed,expected})
    if(!passed)failures.push({organization:m.organizationId,month:m.month})
  }
  report.checks.push({name:'Historical monthly analytics',count:fixture.monthly.length,failures})
  expect(failures).toEqual([])
})

it('historical ledger, document totals, references and tenant relationships stay consistent',async()=>{
  const checks:Record<string,number>={}
  const rows=await db.$queryRawUnsafe<Array<{kind:string;bad:bigint}>>(`
    SELECT 'invoice_math' kind,count(*) bad FROM "Invoice" WHERE "totalCents"<>"subtotalCents"+"taxCents" OR "outstandingCents"<0
    UNION ALL SELECT 'invoice_tenant',count(*) FROM "Invoice" i JOIN "Job" j ON j.id=i."jobId" JOIN "Customer" c ON c.id=i."customerId" WHERE i."organizationId"<>j."organizationId" OR i."organizationId"<>c."organizationId" OR j."customerId"<>c.id
    UNION ALL SELECT 'estimate_tenant',count(*) FROM "Estimate" e JOIN "Job" j ON j.id=e."jobId" WHERE e."organizationId"<>j."organizationId"
    UNION ALL SELECT 'payment_tenant',count(*) FROM "Payment" p JOIN "Invoice" i ON i.id=p."invoiceId" WHERE p."organizationId"<>i."organizationId"
    UNION ALL SELECT 'invoice_line_totals',count(*) FROM "Invoice" i JOIN (SELECT "invoiceId",sum("lineTotalCents") amount FROM "InvoiceLineItem" GROUP BY "invoiceId") l ON l."invoiceId"=i.id WHERE i."subtotalCents"<>l.amount
    UNION ALL SELECT 'invoice_number_collision',count(*) FROM (SELECT "organizationId","invoiceNumber" FROM "Invoice" GROUP BY 1,2 HAVING count(*)>1) x
    UNION ALL SELECT 'estimate_number_collision',count(*) FROM (SELECT "organizationId","estimateNumber" FROM "Estimate" GROUP BY 1,2 HAVING count(*)>1) x
    UNION ALL SELECT 'paid_ledger_mismatch',count(*) FROM "Invoice" i LEFT JOIN (SELECT "invoiceId",sum("amountCents") amount FROM "Payment" WHERE status='succeeded' GROUP BY "invoiceId") p ON p."invoiceId"=i.id WHERE i.status='paid' AND (i."outstandingCents"<>0 OR COALESCE(p.amount,0)<>i."totalCents")`)
  for(const r of rows)checks[r.kind]=Number(r.bad)
  report.checks.push({name:'Database invariants',checks});expect(Object.values(checks).every(n=>n===0)).toBe(true)
  const totals=await db.$queryRawUnsafe<Array<{organizationId:string;total:bigint;outstanding:bigint}>>(`SELECT "organizationId",sum("totalCents") total,sum("outstandingCents") outstanding FROM "Invoice" WHERE id LIKE 'sim-inv-%' GROUP BY 1 ORDER BY 1`)
  for(const e of fixture.companiesExpected){const t=totals.find(x=>x.organizationId===e.organizationId)!;expect(Number(t.total)).toBe(e.invoiceCents);expect(Number(t.outstanding)).toBe(e.receivableCents)}
  report.completed=true
})

it('advances 100 maintenance plans through 36 months with overlapping runs and exact visit counts',async()=>{
  report.completed=false
  const {generateDueRecurringJobs}=await import('../../lib/recurring-generation')
  expect(await db.recurringJob.count()).toBe(0)
  const schedules=Array.from({length:100},(_,i)=>{
    const n=Math.floor(i/10),slot=i%10
    return {id:`sim-recurring-${i}`,organizationId:`sim-org-${String(n).padStart(2,'0')}`,customerId:`sim-customer-${n}-0`,title:`SIMULATED maintenance ${i}`,frequency:slot<5?'monthly':slot<7?'quarterly':slot<9?'biannual':'annual',nextDueDate:new Date('2023-10-01T12:00:00Z')}
  })
  await db.recurringJob.createMany({data:schedules})
  await db.membership.createMany({data:schedules.map(s=>({organizationId:s.organizationId,customerId:s.customerId,recurringJobId:s.id}))})
  const months=[];let total=0
  for(let m=0;m<36;m++){
    const now=new Date(Date.UTC(2023,9+m,1,12))
    const runs=await Promise.all(Array.from({length:4},()=>generateDueRecurringJobs(now)))
    const generated=runs.reduce((n,r)=>n+r.generated,0)
    const expected=50+(m%3===0?20:0)+(m%6===0?20:0)+(m%12===0?10:0)
    months.push({month:now.toISOString().slice(0,7),expected,generated});total+=generated
    expect(generated).toBe(expected)
    expect((await generateDueRecurringJobs(now)).generated).toBe(0)
  }
  const memberships=await db.membership.findMany({include:{recurringJob:true}})
  const expectedVisits:Record<string,number>={monthly:36,quarterly:12,biannual:6,annual:3}
  for(const m of memberships)expect(m.visitsUsed).toBe(expectedVisits[m.recurringJob!.frequency])
  expect(total).toBe(2190)
  expect(await db.job.count({where:{title:{startsWith:'SIMULATED maintenance'}}})).toBe(2190)
  report.checks.push({name:'36-month accelerated recurring engine',schedules:100,overlappingRunsPerMonth:4,idempotentReruns:36,generatedJobs:total,months,passed:true})
  report.completed=true
})

import fs from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { guardedUrl, output } from './seed-history.mjs'
const db=new PrismaClient({datasources:{db:{url:guardedUrl()}}})
try {
  const queries={
    calendar:`SELECT id,title,status,"scheduledFor" FROM "Job" WHERE "organizationId"='sim-org-00' AND "scheduledFor">='2026-08-01' AND "scheduledFor"<'2026-09-01' ORDER BY "scheduledFor" ASC`,
    technicianCalendar:`SELECT id,title,status,"scheduledFor" FROM "Job" WHERE "organizationId"='sim-org-00' AND "assignedUserId"='sim-user-0-2' AND "scheduledFor">='2026-08-01' AND "scheduledFor"<'2026-09-01' ORDER BY "scheduledFor" ASC`,
    documentAllocation:`SELECT COALESCE(MAX(SUBSTRING("invoiceNumber" FROM 5)::bigint),0)+1 FROM "Invoice" WHERE "organizationId"='sim-org-00' AND "invoiceNumber" ~ '^INV-[0-9]{1,15}$'`,
  }
  const plans={checkedAt:new Date().toISOString(),scope:'Quiet local database after pressure; warm-cache diagnostic, not concurrent end-to-end latency',queries:{}}
  for(const [name,sql] of Object.entries(queries)){
    const result=await db.$queryRawUnsafe(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`)
    plans.queries[name]=result[0]['QUERY PLAN'][0]
  }
  await fs.writeFile(`${output}/query-plans.json`,JSON.stringify(plans,null,2))
  console.log(JSON.stringify(Object.fromEntries(Object.entries(plans.queries).map(([name,p])=>[name,{executionMs:p['Execution Time'],rows:p.Plan['Actual Rows']}]))))
}finally{await db.$disconnect()}

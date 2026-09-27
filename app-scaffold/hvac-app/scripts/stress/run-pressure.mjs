import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomBytes, createHmac } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { guardedUrl, output, companyId, employeeId, customerId, marker } from './seed-history.mjs'

const app = process.env.SIM_APP_DIR || '/tmp/fieldclose-release/payment-final-app'
const run = process.env.SIM_RUN || 'baseline'
assert.match(run,/^[a-z0-9-]+$/)
const sustainedSeconds = Number(process.env.SIM_SUSTAINED_SECONDS || 120)
assert.ok(Number.isInteger(sustainedSeconds) && sustainedSeconds >= 120 && sustainedSeconds <= 1800, 'Sustained phase must be 120–1800 seconds')
const base='http://127.0.0.1:3310'
const req=createRequire(`${app}/package.json`)
const { encodeReply } = req('next/dist/compiled/react-server-dom-webpack/client.edge')
const db=new PrismaClient({datasources:{db:{url:guardedUrl()}}})
const password=randomBytes(32).toString('base64url'), signingSecret=`whsec_${randomBytes(32).toString('hex')}`
let server, monitor
const report={run,startedAt:new Date().toISOString(),scope:'Isolated compiled app, real Auth.js logins and HTTP actions; synthetic locally signed payment events, no provider calls',phases:[],checks:[],resources:[],errors:{},samples:[],requests:0}
let stage='setup', ordinal=0
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function pool(items, count, fn) { let i=0; const results=await Promise.allSettled(Array.from({length:count},async()=>{while(i<items.length){const j=i++;await fn(items[j],j)}}));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason }
const percentile=(v,p)=>v.length?[...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.ceil(v.length*p)-1)]:0
function summarize(samples) {
  const times=samples.map(s=>s.ms), successful=samples.filter(s=>s.ok)
  return {requests:samples.length,passed:successful.length,failed:samples.length-successful.length,errorRate:samples.length?(samples.length-successful.length)/samples.length:0,p50Ms:percentile(times,.5),p95Ms:percentile(times,.95),p99Ms:percentile(times,.99),maxMs:times.reduce((max, time) => Math.max(max, time), 0)}
}
class Session {
  cookies=new Map()
  constructor(n,e){this.n=n;this.e=e}
  async request(path,options={},expected=200,label=path.split('?')[0]) {
    assert.equal(new URL(path,base).origin,base)
    const start=performance.now();let status=0,text='',headers
    try {
      const r=await fetch(new URL(path,base),{...options,redirect:'manual',signal:AbortSignal.timeout(20000),headers:{origin:base,...(this.cookies.size?{cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...options.headers}})
      status=r.status;headers=r.headers
      for(const raw of r.headers.getSetCookie()){const [p]=raw.split(';'),idx=p.indexOf('=');if(p.slice(idx+1))this.cookies.set(p.slice(0,idx),p.slice(idx+1));else this.cookies.delete(p.slice(0,idx))}
      text=await r.text()
    } catch(e) { status=e.name==='TimeoutError'?598:599 }
    const expectedStatuses=Array.isArray(expected)?expected:[expected]
    const leaked=[...text.matchAll(/TENANT_(\d{2})_PRIVATE/g)].some(m=>Number(m[1])!==this.n)
    const sample={stage,label,company:this.n,employee:this.e,status,ms:Math.round((performance.now()-start)*100)/100,bytes:Buffer.byteLength(text),ok:expectedStatuses.includes(status)&&!leaked,leak:leaked}
    report.samples.push(sample);report.requests++
    return {status,text,headers,sample,json:()=>JSON.parse(text)}
  }
}
const sessions=Array.from({length:100},(_,i)=>new Session(Math.floor(i/10),i%10))
async function check(name,fn){try{await fn();report.checks.push({name,passed:true})}catch(e){report.checks.push({name,passed:false,error:String(e.message).slice(0,240)})}console.log(JSON.stringify(report.checks.at(-1)))}
const manifest=JSON.parse(await fs.readFile(`${app}/.next/server/server-reference-manifest.json`,'utf8'))
async function action(s,path,name,args){
  const ids=Object.entries(manifest.node).filter(([,v])=>v.exportedName===name&&Object.keys(v.workers).includes(`app${path}/page`))
  assert.equal(ids.length,1,`Action ${name} must be unambiguous`)
  const r=await s.request(path,{method:'POST',headers:{'Next-Action':ids[0][0],Accept:'text/x-component'},body:await encodeReply(args)},200,`action:${name}`)
  const match=r.text.match(/^\d+:(\{"success":(?:true|false).*\})$/m)
  if(!match){r.sample.ok=false;throw Error(`${name}: HTTP${r.status} unrecognized result`)}
  const data=JSON.parse(match[1]);if(!data.success)r.sample.ok=false
  return data
}
async function signedEvent(n,invoice,amount,pi,overrides={}) {
  const event={id:`evt_sim_${run}_${ordinal++}`,object:'event',type:'checkout.session.completed',api_version:'2025-02-24.acacia',livemode:false,account:`acct_simulation_${n}`,data:{object:{id:`cs_test_sim_${ordinal}`,object:'checkout.session',mode:'payment',payment_status:'paid',amount_total:amount,currency:'usd',payment_intent:pi,metadata:{invoiceId:invoice,organizationId:companyId(n)}}},...overrides}
  const body=JSON.stringify(event),t=Math.floor(Date.now()/1000),sig=createHmac('sha256',signingSecret).update(`${t}.${body}`).digest('hex')
  return sessions[n*10].request('/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${t},v1=${sig}`},body},[200], 'signed-synthetic-payment')
}
async function workload(s,j) {
  const r=j%10, own=`sim-live-job-${s.n*10+s.e}`
  if(r<3) return s.request(r===0?'/jobs':r===1?'/field':`/jobs/${own}`,{},200,r===2?'job-detail':r===0?'jobs':'field')
  if(r===3||r===4) return s.request('/api/field-queue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r===3?{type:'job_notes',jobId:own,workSummary:`${marker(s.n)} synthetic service update ${j}`}:{type:'job_status',jobId:own,status:j%2?'completed':'in_progress'})},200,r===3?'write-notes':'write-status')
  if(r===5) return s.request('/calendar?month=2026-08',{},200,'calendar')
  if(r===6) return s.request(s.e>=2?'/field':'/dashboard',{},200,s.e>=2?'field':'dashboard')
  if(r===7) return s.request(s.e===0?'/api/analytics/owner?period=ytd':'/jobs?q=Service',{},200,s.e===0?'analytics':'job-search')
  if(r===8) return s.request(s.e===0?'/reports':`/jobs/${own}`,{},200,s.e===0?'reports':'job-detail')
  return s.request(s.e===0?'/invoices?page=200':'/jobs?page=50',{},200,s.e===0?'invoice-deep-page':'job-deep-page')
}
async function phase(name,concurrency,seconds,think=0){
  stage=name;const first=report.samples.length,start=performance.now(),until=start+seconds*1000;let sent=0
  await Promise.all(Array.from({length:concurrency},(_,worker)=>(async()=>{let j=worker;while(performance.now()<until){await workload(sessions[worker%100],j++);sent++;if(think)await sleep(think)}})()))
  const elapsed=(performance.now()-start)/1000, samples=report.samples.slice(first)
  const value={name,concurrency,thinkMs:think,durationSeconds:elapsed,requestsPerSecond:sent/elapsed,...summarize(samples),routes:Object.fromEntries([...new Set(samples.map(s=>s.label))].map(label=>[label,summarize(samples.filter(s=>s.label===label))]))}
  report.phases.push(value);console.log(JSON.stringify(value));await save()
  if(!server||server.exitCode!==null)throw Error('Server exited during stress')
}
async function save(){await fs.writeFile(`${output}/${run}.json`,JSON.stringify({...report,samples:undefined},null,2));await fs.writeFile(`${output}/${run}-requests.csv`,['phase,route,company,employee,status,ms,bytes,passed,tenant_leak',...report.samples.map(s=>[s.stage,s.label,s.company,s.employee,s.status,s.ms,s.bytes,s.ok,s.leak].join(','))].join('\n'))}
try {
  await fs.mkdir(output,{recursive:true});assert.equal(await db.organization.count(),10);assert.equal(await db.user.count(),100)
  for(const file of ['.env','.env.local','.env.production','.env.production.local']) assert.equal(await fs.stat(`${app}/${file}`).catch(()=>null),null)
  report.buildId=(await fs.readFile(`${app}/.next/BUILD_ID`,'utf8')).trim()
  report.fixture=JSON.parse(await fs.readFile(`${output}/fixture.json`,'utf8')).counts
  await db.user.updateMany({where:{id:{startsWith:'sim-user-'}},data:{hashedPassword:await bcrypt.hash(password,12)}})
  const env={PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',VERCEL_ENV:'preview',DATABASE_URL:guardedUrl(),AUTH_SECRET:randomBytes(48).toString('hex'),AUTH_TRUST_HOST:'true',AUTH_URL:base,APP_URL:base,NEXT_PUBLIC_APP_URL:base,SCHEDULED_TASKS_ENABLED:'false',STRIPE_SECRET_KEY:'rk_test_simulation_noncredential',STRIPE_CONNECT_WEBHOOK_SECRET:signingSecret,STRIPE_WEBHOOK_SECRET:`whsec_${randomBytes(32).toString('hex')}`}
  server=spawn(process.execPath,['--max-old-space-size=2048','--require',new URL('./network-guard.cjs',import.meta.url).pathname,req.resolve('next/dist/bin/next'),'start','-H','127.0.0.1','-p','3310'],{cwd:app,env,stdio:['ignore','pipe','pipe']})
  server.stdout.resume();server.stderr.on('data',bytes=>{const t=bytes.toString();for(const key of ['P2024','P2028','P2034','SIMULATION_EXTERNAL_NETWORK_BLOCKED','out of memory','PrismaClientKnownRequestError'])if(t.includes(key))report.errors[key]=(report.errors[key]||0)+1})
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Server startup failed');try{if((await fetch(`${base}/api/auth/csrf`)).ok)break}catch{}await sleep(200)}
  monitor=setInterval(()=>{try{const [cpu,rss]=execFileSync('ps',['-p',String(server.pid),'-o','%cpu=,rss='],{encoding:'utf8'}).trim().split(/\s+/).map(Number);report.resources.push({at:new Date().toISOString(),stage,cpu,rssMiB:rss/1024});if(rss/1024>3072)server.kill('SIGTERM')}catch{}},2000)
  await check('100 real employee credential sign-ins',async()=>{
    await pool(sessions,4,async s=>{
      const csrf=(await s.request('/api/auth/csrf')).json().csrfToken
      await s.request('/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},body:new URLSearchParams({csrfToken:csrf,email:`company${s.n}.employee${s.e}@simulation.example.test`,password,callbackUrl:`${base}/dashboard`})})
      assert.equal((await s.request('/api/auth/session')).json()?.user?.id,employeeId(s.n,s.e))
    })
  })
  if(report.checks.some(c=>!c.passed))throw Error('Authentication prerequisite failed')
  stage='boundaries'
  await check('100 employees denied cross-company job reads and writes',async()=>{
    await pool(sessions,10,async s=>{const foreign=`sim-live-job-${((s.n+1)%10)*10}`;const r=await s.request(`/jobs/${foreign}`,{},404,'foreign-job-read');assert.equal(r.status,404);assert.equal(r.sample.leak,false);assert.equal((await s.request('/api/field-queue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'job_notes',jobId:foreign,workSummary:'ATTACK SHOULD NOT SAVE'})},404,'foreign-job-write')).status,404)})
  })
  await check('80 technicians denied another technician assigned job',async()=>{await pool(sessions.filter(s=>s.e>=2),10,async s=>assert.equal((await s.request(`/jobs/sim-live-job-${s.n*10+(s.e===9?2:s.e+1)}`,{},404,'unassigned-job')).status,404))})
  await check('non-pricing roles denied financial analytics',async()=>{
    const results=await Promise.all(sessions.filter(s=>s.e!==0).map(s=>s.request('/api/analytics/owner?period=ytd',{},403,'role-financial-analytics')))
    assert.equal(results.filter(r=>r.status===403).length,90)
  })
  await check('10 owner customer exports exact tenant and 1980 active customers',async()=>{await pool(sessions.filter(s=>s.e===0),2,async s=>{const r=await s.request('/api/settings/export?entity=customers&format=json');assert.equal(r.status,200);assert.equal(r.json().length,1980);assert.equal(r.sample.leak,false)})})
  stage='workflow'
  const ids=[]
  await check('100 invoices created through real authenticated server actions with unique numbers',async()=>{
    await pool(Array.from({length:100},(_,i)=>i),20,async i=>{
      const n=i%10,s=sessions[n*10],f=new FormData();f.set('customerId',customerId(n,0));f.set('title',`${marker(n)} Pressure workflow ${run} ${i}`)
      const job=await action(s,'/jobs/new','createJob',[f]);assert.equal(job.success,true)
      const invoice=await action(s,'/invoices/new','createInvoice',[{jobId:job.jobId,descriptionOfWork:'Synthetic stress test work',taxCents:700,lineItems:[{name:'Synthetic labor',quantity:2,unitPriceCents:5000}]}]);assert.equal(invoice.success,true)
      ids.push({n,id:invoice.invoiceId,pi:`pi_sim_${run}_${i}`})
    })
    const rows=await db.invoice.findMany({where:{id:{in:ids.map(i=>i.id)}},select:{organizationId:true,invoiceNumber:true,totalCents:true}})
    assert.equal(rows.length,100);assert.equal(new Set(rows.map(r=>`${r.organizationId}:${r.invoiceNumber}`)).size,100);assert.ok(rows.every(r=>r.totalCents===10700))
  })
  await check('signed synthetic settlement: 100 payments, 5 concurrent duplicates each, no overcollection',async()=>{
    assert.equal(ids.length,100)
    // Fixture issuance only: bypasses email deliberately; no recipient/provider exists.
    await db.invoice.updateMany({where:{id:{in:ids.map(i=>i.id)}},data:{status:'sent',sentAt:new Date()}})
    const deliveries=ids.flatMap(item=>Array.from({length:5},()=>item))
    await pool(deliveries,50,async item=>assert.equal((await signedEvent(item.n,item.id,10700,item.pi)).status,200))
    assert.equal(await db.payment.count({where:{invoiceId:{in:ids.map(i=>i.id)},status:'succeeded'}}),100)
    assert.equal(await db.invoice.count({where:{id:{in:ids.map(i=>i.id)},status:'paid',outstandingCents:0}}),100)
  })
  await check('late failures do not reverse successful payments',async()=>{await pool(ids,20,async item=>{
    const object={id:item.pi,object:'payment_intent',metadata:{invoiceId:item.id,organizationId:companyId(item.n)}}
    const r=await signedEvent(item.n,item.id,10700,item.pi,{type:'payment_intent.payment_failed',data:{object}});assert.equal(r.status,200)
  });assert.equal(await db.payment.count({where:{invoiceId:{in:ids.map(i=>i.id)},status:'succeeded'}}),100)})
  await phase('warmup',10,10,250)
  for(const concurrency of [10,25,50,100,200])await phase(`burst-${concurrency}`,concurrency,20)
  await phase('sustained-100',100,sustainedSeconds,500)
  await phase('recovery-10',10,20,250)
  stage='integrity'
  await check('post-pressure: no historical balance corruption',async()=>{
    const rows=await db.$queryRawUnsafe(`SELECT count(*)::int AS bad FROM "Invoice" i WHERE i.id LIKE 'sim-inv-%' AND ((i.status='paid' AND i."outstandingCents"<>0) OR i."outstandingCents"<0 OR i."totalCents"<>i."subtotalCents"+i."taxCents")`)
    assert.equal(rows[0].bad,0)
  })
  report.leakedResponses=report.samples.filter(s=>s.leak).length
  report.finishedAt=new Date().toISOString();report.completed=true
} catch(e){report.fatal=String(e.message).slice(0,240);report.completed=false;process.exitCode=1}
finally {
  clearInterval(monitor);server?.kill('SIGTERM')
  if(server&&server.exitCode===null){await Promise.race([new Promise(r=>server.once('exit',r)),sleep(3000)]);if(server.exitCode===null)server.kill('SIGKILL')}
  report.total=summarize(report.samples);report.peakServerRssMiB=Math.max(0,...report.resources.map(r=>r.rssMiB));report.localOnly=true
  await save();await db.$disconnect();console.log(JSON.stringify({run,completed:report.completed,checks:report.checks,total:report.total,peakRss:report.peakServerRssMiB,fatal:report.fatal}))
}

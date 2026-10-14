"""Generate a portable, synthetic-only pressure-test report. Requires matplotlib."""
import csv
import hashlib
import html
import json
import shutil
import statistics
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--source', default='/tmp/fieldclose-stress-20260927')
parser.add_argument('--output', default='/Users/hatfield/Desktop/fieldclose-web/artifacts/three-year-simulation-2026-09-27')
args = parser.parse_args()
SOURCE = Path(args.source)
DEST = Path(args.output)
DEST.mkdir(parents=True, exist_ok=True)
baseline = json.loads((SOURCE / 'baseline.json').read_text())
final = json.loads((SOURCE / 'patched.json').read_text())
history = json.loads((SOURCE / 'history-validation.json').read_text())
fixture = json.loads((SOURCE / 'fixture.json').read_text())
assert baseline['completed'] and final['completed'] and history['completed']
assert all(x['passed'] for x in final['checks'])

def read_rows(name):
    with (SOURCE / name).open() as handle:
        return list(csv.DictReader(handle))

baseline_rows = read_rows('baseline-requests.csv')
final_rows = read_rows('patched-requests.csv')
expected_redirects = sum(r['status'] == '307' and r['route'] == 'dashboard' and int(r['employee']) >= 2 for r in baseline_rows)
authorization_failures = sum(r['status'] == '200' and r['route'] == 'role-financial-analytics' for r in baseline_rows)
other_baseline_failures = sum(r['passed'] == 'false' for r in baseline_rows) - expected_redirects - authorization_failures
assert other_baseline_failures == 0
phases = final['phases']
soak = next(p for p in phases if p['name'] == 'sustained-100')
peak = next(p for p in phases if p['name'] == 'burst-200')
recovery = next(p for p in phases if p['name'] == 'recovery-10')
load_rows = [r for r in final_rows if r['phase'].startswith(('burst-', 'sustained-', 'recovery-', 'warmup'))]
integrity = next(c['checks'] for c in history['checks'] if c['name'] == 'Database invariants')
recurring = next(c for c in history['checks'] if c['name'].startswith('36-month'))
server_failures = sum(int(r['status']) >= 500 for r in final_rows)
tail_routes = sorted(peak['routes'].items(), key=lambda item: item[1]['p95Ms'], reverse=True)
resources = [r for r in final['resources'] if r['stage'] == 'sustained-100']
memory_first = statistics.median(r['rssMiB'] for r in resources[:10]) if resources else 0
memory_last = statistics.median(r['rssMiB'] for r in resources[-10:]) if resources else 0

summary = {
    'applicationRevision': '139de1a57a64b6de0612399037e230d943ec6ca7',
    'baselineApplicationRevision': '06b5b7b74caaf965115f60cf36884314c4c90935',
    'baselineBuildId': baseline['buildId'], 'patchedBuildId': final['buildId'],
    'hardware': {'processor': 'Apple M4 Pro', 'memoryGiB': 24, 'database': 'PostgreSQL 17.10', 'appPoolConnections': 20, 'sharedLocalAppDatabaseAndGenerator': True},
    'model': {k: fixture[k] for k in ['start', 'end', 'companies', 'employees', 'technicians', 'workdaysPerYear', 'jobsPerTechnicianDay']},
    'seededRows': sum(fixture['counts'].values()), 'historicalCounts': fixture['counts'],
    'seededDatabaseMiB': fixture['databaseBytes'] / 1024 ** 2,
    'requests': {'baseline': len(baseline_rows), 'patched': len(final_rows), 'total': len(baseline_rows) + len(final_rows), 'patchedTimedLoadRequests': len(load_rows)},
    'baselineFindings': {'financialRoleViolations': authorization_failures, 'expectedTechnicianRedirectsInitiallyMisclassified': expected_redirects, 'otherUnexpectedFailures': other_baseline_failures},
    'patchedChecks': final['checks'], 'patchedServerErrorsOrTimeouts': server_failures,
    'patchedUnexpectedResponses': final['total']['failed'], 'crossTenantMarkerLeaks': final['leakedResponses'],
    'historicalMonthlyChecks': len(history['monthly']), 'historicalMonthlyPassed': sum(x['passed'] for x in history['monthly']),
    'historicalInvariantViolations': integrity,
    'maintenance': {k: v for k, v in recurring.items() if k != 'months'},
    'phases': phases, 'peakServerRssMiB': final['peakServerRssMiB'],
    'sustainedServerRssFirst20sMedianMiB': memory_first, 'sustainedServerRssLast20sMedianMiB': memory_last,
    'limits': ['Bulk history is distinct from real HTTP workflow execution.', 'Payment events were locally generated and signed; no external processor request or real money.', 'Local shared-machine timings do not establish Vercel/Supabase capacity, network latency, cold starts or distributed rate limits.', 'Closed-loop traffic includes a two-minute sustained phase, not a multi-day soak or years of availability.', 'Historical photo bytes, browser rendering, external message delivery, physical readers and external-provider outages were not simulated.', 'The corrected technician journey and added synthetic maintenance rows make before/after performance comparisons directional, not controlled optimization evidence.'],
}
(DEST / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
for name in ['baseline.json', 'baseline-requests.csv', 'patched.json', 'patched-requests.csv', 'fixture.json', 'history-validation.json', 'history.log', 'unit.log', 'typecheck.log', 'build.log']:
    shutil.copy2(SOURCE / name, DEST / name)
for name in ['query-plans.json', 'post-pressure-health.json', 'deployment.json', 'final-public-routes.json', 'final-public-activation-pages.json']:
    if (SOURCE / name).exists(): shutil.copy2(SOURCE / name, DEST / name)
with (DEST / 'phase-summary.csv').open('w') as f:
    keys = ['name','concurrency','requests','requestsPerSecond','p50Ms','p95Ms','p99Ms','maxMs','failed']
    writer = csv.DictWriter(f, fieldnames=keys); writer.writeheader()
    for phase in phases: writer.writerow({k: phase[k] for k in keys})

plt.rcParams.update({'font.family':'DejaVu Sans', 'font.size':10, 'axes.spines.top':False, 'axes.spines.right':False})
fig, axes = plt.subplots(1, 2, figsize=(12,4.4), layout='constrained')
bursts = [p for p in phases if p['name'].startswith('burst-')]
x = [p['concurrency'] for p in bursts]
for metric,label,color in [('p95Ms','95th percentile','#006f80'),('p99Ms','99th percentile','#d56d31')]:
    axes[0].plot(x,[p[metric]/1000 for p in bursts],marker='o',label=label,color=color,lw=2)
axes[0].set(title='Mixed workload latency',xlabel='Concurrent outstanding requests',ylabel='Seconds');axes[0].legend();axes[0].grid(alpha=.15)
names,values=zip(*[(name,data['p95Ms']/1000) for name,data in tail_routes[:6]])
axes[1].barh(names[::-1],values[::-1],color=['#006f80']*5+['#d56d31'])
axes[1].set(title='Slowest routes at 200 concurrency',xlabel='95th-percentile response time (seconds)')
for i,value in enumerate(values[::-1]): axes[1].text(value+.02,i,f'{value:.2f}s',va='center')
axes[1].set_xlim(0,max(values)*1.2)
fig.suptitle('FieldClose • three-year data / patched local pressure run',fontweight='bold',fontsize=15)
fig.savefig(DEST / 'pressure-results.png',dpi=180);fig.savefig(DEST / 'pressure-results.svg');plt.close(fig)

rows='\n'.join(f"| {p['name']} | {p['concurrency']} | {p['requests']:,} | {p['requestsPerSecond']:.1f} | {p['p95Ms']/1000:.3f}s | {p['p99Ms']/1000:.3f}s | {p['maxMs']/1000:.3f}s | {p['failed']} |" for p in phases)
text=f'''# FieldClose — three-year simulation and pressure test

**Result:** the tested core workflows retained correct balances and tenant boundaries under the modeled workload. A financial-role access defect was found, corrected and retested. The calendar remains a performance hotspot during extreme bursts. This is evidence for controlled daily use, not certification of unattended operation or hosted capacity.

## What was modeled

- 10 companies, 100 signed-in employees: 10 owners, 10 dispatchers, 80 technicians.
- September 27, 2023–September 26, 2026; 250 operating days/year; three visits per technician/day.
- 180,000 historical jobs plus 100 separate current-work fixtures; 20,000 customers; 180,000 estimates; 162,000 invoices; 149,540 historical payments; 540,000 activity events.
- **{summary['seededRows']:,} seeded records**, occupying **{summary['seededDatabaseMiB']:.1f} MiB** before live workload additions. Amounts and customers are fictional.
- Apple M4 Pro, 24 GiB RAM, PostgreSQL 17.10, 20 application database connections; app, database and load generator share the machine.

## Executed checks

**{summary['requests']['total']:,} actual HTTP requests** across original and corrected runs ({len(baseline_rows):,} original; {len(final_rows):,} corrected). Both runs signed in all 100 employees with real Auth.js. Each run created 100 jobs and invoices through actual server actions and delivered 500 locally signed settlement notifications for 100 invoices, followed by 100 late failure notifications. Each invoice retained exactly one successful payment and zero outstanding balance. These were synthetic callback tests; Stripe was never called.

All **{len(history['monthly'])} company/month checks** matched seven independently generated financial/workload expectations. Eight database invariants found no monetary, document-number or tenant-link violations. The actual recurring engine advanced 100 plans through 36 dates with four overlapping runs plus a repeat at each date, producing exactly **{recurring['generatedJobs']:,} maintenance visits** with correct membership counts.

The corrected run passed **{len(final['checks'])}/{len(final['checks'])} workflow/security checks**, with **{server_failures} server errors/timeouts**, **{final['total']['failed']} unexpected responses**, and **{final['leakedResponses']} cross-company marker leaks**. Company reads/writes, technician assignment boundaries, role-gated financial data, and complete owner exports were checked. Marker checks supplement explicit 404/403 assertions; they do not establish coverage of every route.

## Response times — corrected application

P95 means 95% of requests completed within that time. Timings include localhost HTTP and server work, not a human browser's rendering or internet latency. Bursts have no think time. The sustained phase uses 100 users, 500 ms think time and lasts 120 seconds. This is a closed-loop generator: slow requests reduce offered throughput.

| Phase | Concurrency | Requests | Requests/sec | P95 | P99 | Maximum | Unexpected failures |
|---|---:|---:|---:|---:|---:|---:|---:|
{rows}

![Measured latency and slow routes](pressure-results.png)

At sustained 100-user load, P95 was **{soak['p95Ms']/1000:.3f}s** and throughput **{soak['requestsPerSecond']:.1f} requests/sec**. Recovery P95 was **{recovery['p95Ms']/1000:.3f}s**. Peak measured application RSS was **{final['peakServerRssMiB']:.0f} MiB**. Median RSS over the first/last approximately 20 seconds of the sustained phase was **{memory_first:.0f}/{memory_last:.0f} MiB**; a two-minute observation cannot rule out a long-running memory leak.

## Findings and actions

1. **High — financial access:** all 90 non-pricing employees could read company-wide financial analytics through the JSON endpoint in the original build. The financial screens already restricted them. The API now enforces the same pricing capability and private/no-store responses. All 90 were denied in the corrected HTTP run; nine regression cases and the full 1,427-test unit suite passed. This was within-company role exposure, not a cross-company breach. The test does not establish whether any real user exploited it.
2. **Performance — crowded calendar:** the slowest 200-concurrency route was **{tail_routes[0][0]}**, P95 **{tail_routes[0][1]['p95Ms']/1000:.2f}s**. Overall averages hide this tail. Profile server rendering and query waits on a production-like staging environment; bound the number of rendered jobs per day and retain a drill-down to the complete list. Do not claim an indexing change alone will fix rendering or queueing delays.
3. **Harness correction:** the original runner incorrectly marked **{expected_redirects:,} expected technician dashboard redirects** as failures. These are retained in raw data and explicitly reclassified, not hidden. The corrected journey goes directly to the technician field view. There were **{other_baseline_failures} other unexpected baseline failures** after separating the **{authorization_failures} real financial-access violations**. Four initial trade-profile fixture slugs were also normalized before the corrected run.
4. **Capacity boundary:** this local test showed no server errors at up to 200 outstanding requests. It does not identify the hosted breaking point or guarantee a number of paying companies. Run a bounded staging test with the actual production hosting/database tiers, realistic WAN latency, external-service failure injection and a multi-hour soak before making capacity promises.

Quiet, warm-cache database probes after the run measured the owner calendar query at 1.724 ms (485 rows), technician calendar at 0.535 ms (60 rows), and document-number allocation at 11.766 ms. These are not concurrent timings. They suggest profiling server rendering and queueing as well as database contention; they do not prove the cause of the 11-second HTTP tail. Full query plans are included.

## Limits and next priorities

Historical records were bulk-generated; they were not 180,000 end-to-end browser journeys. Calendar-month analytics and the recurring engine were executed separately. The accelerated recurring clock does not age every application component or browser token. External email, photo blobs/storage, physical readers, real payments/payouts, internet failures, serverless cold starts and production cron invocation are outside this simulation. No real customer was contacted and no real money moved. Pressure was applied only to the isolated local database/application. The test database is retained for inspection, and temporary app processes are stopped after each run.

The next performance priority is the crowded calendar. The next confidence priority is hosted staging plus longer-duration and provider-failure testing. The permissions fix (139de1a) is published as deployment dpl_BQRjQ3wwSJmmsutkpatewjRRTk97. Candidate and public checks each passed 24 routes plus eight metadata/access checks. Exact public alias/revision binding and database health were verified after promotion. These light public checks are separate from the local load experiment.

## Reproducibility and data

Application under test: `{summary['applicationRevision']}`; original runtime: `{summary['baselineApplicationRevision']}`. Corrected build: `{final['buildId']}`. The repository's `scripts/stress/README.md` documents execution, safeguards and workload details.

Raw per-request CSV, phase summaries, JSON receipts, historical expectations, invariant checks and charts are included alongside this report. Credentials, login cookies and signing secrets were held only in memory and are not included.
'''
(DEST / 'report.md').write_text(text)
table_rows=''.join(f"<tr><td>{html.escape(p['name'])}</td><td>{p['concurrency']}</td><td>{p['requests']:,}</td><td>{p['p95Ms']/1000:.3f}s</td><td>{p['p99Ms']/1000:.3f}s</td><td>{p['failed']}</td></tr>" for p in phases)
page=f'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FieldClose pressure test</title><style>body{{font:16px/1.6 system-ui;margin:40px auto;max-width:1100px;padding:0 24px;color:#152c33;background:#f5f8f8}}h1{{font-size:40px;line-height:1.1}}.cards{{display:flex;gap:20px;flex-wrap:wrap}}.cards div{{background:white;padding:24px;border:1px solid #dae3e4;border-radius:12px;flex:1}}strong{{font-size:25px;display:block}}table{{width:100%;border-collapse:collapse;background:white}}td,th{{padding:12px;text-align:left;border-bottom:1px solid #dae3e4}}img{{width:100%;margin:20px 0}}a{{color:#006f80}}.note{{background:#fff0df;padding:20px;border-radius:10px}}</style><p>ENGINEERING VERIFICATION · 27 SEPTEMBER 2026</p><h1>Three years of data.<br>100 employees under pressure.</h1><p>10 synthetic businesses • isolated local application • no real charges or messages</p><div class="cards"><div><strong>{summary['seededRows']:,}</strong>seeded records</div><div><strong>{summary['requests']['total']:,}</strong>HTTP requests, two runs</div><div><strong>{soak['p95Ms']/1000:.3f}s</strong>P95 at sustained 100-user load</div></div><h2>Outcome</h2><p>Financial and tenant invariants passed. One real financial-role access defect was found and corrected. The crowded calendar remains the principal burst-latency concern.</p><img src="pressure-results.png" alt="Response latency and slow routes"><h2>Corrected-run measurements</h2><table><thead><tr><th>Phase</th><th>Concurrency</th><th>Requests</th><th>P95</th><th>P99</th><th>Failures</th></tr></thead><tbody>{table_rows}</tbody></table><h2>Correctness</h2><p>{len(history['monthly'])} company/month financial checks matched. 100 maintenance plans produced exactly {recurring['generatedJobs']:,} visits over 36 simulated months with overlapping runs. Corrected HTTP tests observed no cross-company leaks, duplicate payments, server errors or timeouts.</p><p class="note">This is a local closed-loop stress experiment, not three years of uptime or a production-hosting capacity guarantee. Historical data was backfilled; actual workflow requests and recurring-clock execution are reported separately.</p><p><a href="report.md">Full methodology and analysis</a> · <a href="summary.json">Machine-readable summary</a> · <a href="phase-summary.csv">Phase data</a> · <a href="patched-requests.csv">Corrected request data</a> · <a href="baseline-requests.csv">Original request data</a></p>'''
(DEST / 'report.html').write_text(page)
hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in DEST.iterdir() if p.is_file() and p.name!='SHA256.json'}
(DEST / 'SHA256.json').write_text(json.dumps(hashes,indent=2)+'\n')
print(json.dumps({'report':str(DEST/'report.html'),'summary':summary['requests'],'sustainedP95Ms':soak['p95Ms'],'peakCalendarP95Ms':peak['routes']['calendar']['p95Ms']}))

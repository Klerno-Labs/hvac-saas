import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateProductionEnvironment } from './production-env-check.mjs';
import { inspectScheduledResponse, runScheduled } from './run-scheduled.mjs';

const fixture = {
  DEPLOYMENT_ENV: 'production', APP_URL: 'https://fieldclose.app', AUTH_URL: 'https://fieldclose.app',
  AUTH_SECRET: 'fixture-only-auth-secret-not-a-real-credential', AUTH_TRUST_HOST: 'true',
  SCHEDULED_TASKS_ENABLED: 'false', CRON_SECRET: 'fixture-only-cron-secret-not-a-real-credential',
  STRIPE_SECRET_KEY: 'rk_live_fixture', STRIPE_PUBLISHABLE_KEY: 'pk_live_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_platform_fixture', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect_fixture',
  STRIPE_STARTER_PRICE_ID: 'price_fixture_starter', STRIPE_PRO_PRICE_ID: 'price_fixture_pro',
  R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture', R2_BUCKET: 'fixture',
  RESEND_API_KEY: 'fixture', EMAIL_FROM: 'fixture@example.test',
  DATABASE_URL: 'postgresql://fixture:fixture@aws-0-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require',
};

test('accepts a paused production configuration without contacting providers', () => {
  assert.deepEqual(validateProductionEnvironment(fixture), []);
});
test('startup guard verifies actual IPv4 runtime settings and never prints credentials', () => {
  const script = fileURLToPath(new URL('./production-env-check.mjs', import.meta.url));
  const env = { ...process.env, ...fixture, NODE_OPTIONS: '' };
  const passed = spawnSync(process.execPath, ['--dns-result-order=ipv4first', '--no-network-family-autoselection', script], { env, encoding: 'utf8' });
  assert.equal(passed.status, 0);
  const blocked = spawnSync(process.execPath, ['--dns-result-order=verbatim', '--network-family-autoselection', script], { env, encoding: 'utf8' });
  assert.equal(blocked.status, 1);
  assert.ok(blocked.stderr.includes('IPv4 provider egress configuration'));
  assert.ok(!(passed.stdout + passed.stderr + blocked.stdout + blocked.stderr).includes(fixture.AUTH_SECRET));
});
for (const overrides of [
  { DEPLOYMENT_ENV: 'preview' }, { APP_URL: 'https://staging.fieldclose.app' },
  { AUTH_URL: 'http://localhost:3001' }, { SCHEDULED_TASKS_ENABLED: undefined },
  { AUTH_SECRET: ' '.repeat(32) }, { AUTH_SECRET: 'short'.padEnd(64) },
  { AUTH_SECRET: 'replace-me-with-openssl-rand-base64-32' },
  { DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:56487/synthetic_test?sslmode=require' },
  { DATABASE_URL: 'postgresql://fixture:fixture@aws-0-us-east-2.pooler.supabase.com/postgres' },
  { STRIPE_SECRET_KEY: 'rk_test_fixture' }, { R2_SECRET_ACCESS_KEY: '' },
  { NODE_OPTIONS: '--require=/srv/fieldclose/current/scripts/stress/network-guard.cjs' },
]) test(`rejects unsafe production boundary ${Object.keys(overrides)[0]}`, () => {
  assert.ok(validateProductionEnvironment({ ...fixture, ...overrides }).length);
});

test('HTTP 200 does not hide partial delivery or review work', () => {
  const complete = { success: true, organizationsProcessed: 1, attemptsCreated: 1, attemptsSkipped: 0, channelsAccepted: 1, errors: 0, needsReview: 0 };
  assert.equal(inspectScheduledResponse(200, { ...complete, success: false, errors: 1 }, 'collections').passed, false);
  assert.equal(inspectScheduledResponse(200, { ...complete, needsReview: 1 }, 'collections').passed, false);
  assert.equal(inspectScheduledResponse(200, { ...complete, errors: '0' }, 'collections').passed, false);
  assert.equal(inspectScheduledResponse(500, complete, 'collections').passed, false);
});
test('never echoes arbitrary backend fields', () => {
  assert.deepEqual(inspectScheduledResponse(200, { success: true, errors: 0, sent: 2, email: 'private@example.test', token: 'secret' }, 'appointments'), { passed: true, counters: { sent: 2, errors: 0 } });
});
test('valid signing keys with whitespace are preserved verbatim', () => {
  const env = { ...fixture, AUTH_SECRET: `\n ${fixture.AUTH_SECRET} \t` };
  const before = env.AUTH_SECRET;
  assert.deepEqual(validateProductionEnvironment(env), []);
  assert.equal(env.AUTH_SECRET, before);
});
for (const [task, complete] of Object.entries({
  recurring: { generated: 0, generatedMembershipVisits: 0 },
  collections: { organizationsProcessed: 0, attemptsCreated: 0, attemptsSkipped: 0, channelsAccepted: 0, errors: 0, needsReview: 0 },
  appointments: { sent: 0, errors: 0 },
})) test(`requires complete numeric ${task} counters including on empty runs`, () => {
  assert.equal(inspectScheduledResponse(200, { success: true, ...complete }, task).passed, true);
  assert.equal(inspectScheduledResponse(200, { success: true }, task).passed, false);
  for (const field of Object.keys(complete)) {
    const missing = { success: true, ...complete }; delete missing[field];
    assert.equal(inspectScheduledResponse(200, missing, task).passed, false);
    for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '0', null]) {
      assert.equal(inspectScheduledResponse(200, { success: true, ...complete, [field]: invalid }, task).passed, false);
    }
  }
});
test('rejects unknown response contracts and impossible recurring subtotals', () => {
  for (const body of [null, [], true, { success: true }]) assert.equal(inspectScheduledResponse(200, body, 'unknown').passed, false);
  assert.equal(inspectScheduledResponse(200, { success: true, generated: 1, generatedMembershipVisits: 2 }, 'recurring').passed, false);
});
test('paused and unknown tasks do not make requests', async () => {
  const request = () => { throw new Error('must not request'); };
  assert.equal((await runScheduled('recurring', fixture, request)).reason, 'configuration_paused_or_invalid');
  assert.equal((await runScheduled('https://attacker.example/', { ...fixture, SCHEDULED_TASKS_ENABLED: 'true' }, request)).task, 'invalid');
});
test('pins loopback destination, authorization and redirect rejection', async () => {
  let calls = 0;
  const result = await runScheduled('recurring', { ...fixture, SCHEDULED_TASKS_ENABLED: 'true' }, async (url, options) => {
    calls++;
    assert.equal(url, 'http://127.0.0.1:3001/api/recurring/generate');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${fixture.CRON_SECRET}`);
    return new Response(JSON.stringify({ success: true, generated: 2, generatedMembershipVisits: 1 }), { status: 200 });
  });
  assert.equal(calls, 1); assert.equal(result.passed, true);
  assert.ok(!JSON.stringify(result).includes(fixture.CRON_SECRET));
});
test('uncertain delivery fails once without exposing the transport error or retrying', async () => {
  let calls = 0;
  const result = await runScheduled('appointments', { ...fixture, SCHEDULED_TASKS_ENABLED: 'true' }, async () => { calls++; throw new Error(fixture.CRON_SECRET); });
  assert.equal(calls, 1); assert.equal(result.passed, false); assert.equal(result.reviewRequired, true);
  assert.ok(!JSON.stringify(result).includes(fixture.CRON_SECRET));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { crc32, inflateSync } from 'node:zlib';
import { chmod, mkdtemp, open, readdir, readFile, realpath, rename, rm, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BUCKET, PROBE_TYPE, WEBHOOK_CASES, createReceipt, parseArgs, requestJson, validateProbeEnvironment, verifyR2, verifyStripeIdentity, verifyWebhooks, writeReceiptFile } from './verify-providers.mjs';

const env = Object.freeze({
  DEPLOYMENT_ENV: 'production', APP_URL: 'https://fieldclose.app', AUTH_URL: 'https://fieldclose.app',
  STRIPE_SECRET_KEY: 'rk_live_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_platformfixture', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connectfixture',
  R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'privatefixtureid', R2_SECRET_ACCESS_KEY: 'privatefixturesecret', R2_BUCKET: BUCKET,
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const statusError = status => ({ $metadata: { httpStatusCode: status }, message: env.R2_SECRET_ACCESS_KEY });

test('requires explicit actions and refuses arbitrary target URLs or duplicate flags', () => {
  assert.equal(parseArgs([]).help, true);
  assert.equal(parseArgs(['--webhooks']).target, 'candidate');
  assert.equal(parseArgs(['--stripe-identity', 'acct_fixture']).account, 'acct_fixture');
  for (const args of [['--webhooks', '--webhook-target', 'https://attacker.example'], ['--webhooks', '--webhooks'], ['--r2-roundtrip'], ['--r2-roundtrip', '--receipt-dir', 'relative'], ['--stripe-identity', '--webhooks'], ['--unknown'], ['--webhook-target', 'public']]) assert.throws(() => parseArgs(args));
});

test('checks production identity, live key, secret separation, exact bucket and account hostname before calls', () => {
  const options = { webhooks: true, r2: true };
  assert.doesNotThrow(() => validateProbeEnvironment(env, options));
  for (const change of [{ DEPLOYMENT_ENV: 'preview' }, { APP_URL: 'https://staging.fieldclose.app' }, { AUTH_URL: 'https://fieldclose.app/' }, { STRIPE_SECRET_KEY: 'sk_test_fixture' }, { STRIPE_CONNECT_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET }, { R2_BUCKET: 'another-bucket' }, { R2_ACCOUNT_ID: 'attacker.example/' }, { NODE_OPTIONS: '--require=network-guard.cjs' }]) assert.throws(() => validateProbeEnvironment({ ...env, ...change }, options));
});

for (const target of ['candidate', 'public']) test(`seven ${target} webhook cases use only unknown events with correct signatures and scopes`, async () => {
  let index = 0;
  const eventIds = new Set();
  const result = await verifyWebhooks(env, target, async (url, options) => {
    const probe = WEBHOOK_CASES[index++];
    assert.equal(url, `${target === 'candidate' ? 'http://127.0.0.1:3001' : 'https://fieldclose.app'}${probe.path}`);
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'POST');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Host, target === 'candidate' ? 'fieldclose.app' : undefined);
    assert.equal(options.headers['X-Forwarded-Proto'], target === 'candidate' ? 'https' : undefined);
    const event = JSON.parse(options.body);
    assert.equal(event.type, PROBE_TYPE);
    assert.equal(event.livemode, true);
    assert.deepEqual(event.data.object, {});
    assert.equal(Boolean(event.account), probe.account);
    if (event.account) assert.equal(event.account, 'acct_fieldclose_deployment_probe');
    assert.match(event.id, /^evt_fieldclose_probe_[a-f0-9]{32}$/);
    assert.ok(!eventIds.has(event.id)); eventIds.add(event.id);
    const header = options.headers['Stripe-Signature'];
    const timestamp = header.split(',')[0].slice(2);
    const digest = header.split(',')[1].slice(3);
    const secret = probe.secret === 'platform' ? env.STRIPE_WEBHOOK_SECRET : env.STRIPE_CONNECT_WEBHOOK_SECRET;
    const valid = createHmac('sha256', secret).update(`${timestamp}.${options.body}`).digest('hex');
    if (probe.secret === 'invalid') assert.notEqual(digest, valid); else assert.equal(digest, valid);
    return probe.expected === 200 ? json({ received: true, ignored: true }) : json({ error: probe.error }, 400);
  });
  assert.equal(index, 7);
  assert.equal(result.passed, true);
  assert.equal(result.stripeOriginDeliveryVerified, false);
  assert.ok(!JSON.stringify(result).includes('whsec_'));
});

test('a 200 acknowledgement without ignored:true fails the webhook contract', async () => {
  const result = await verifyWebhooks(env, 'candidate', async () => json({ received: true }));
  assert.equal(result.passed, false);
  assert.equal(result.cases.every(item => !item.passed), true);
});
test('webhook transport errors are sanitized and never retried', async () => {
  let calls = 0;
  const result = await verifyWebhooks(env, 'candidate', async () => { calls++; throw new Error(env.STRIPE_WEBHOOK_SECRET); });
  assert.equal(calls, 7);
  assert.equal(result.passed, false);
  assert.ok(!JSON.stringify(result).includes(env.STRIPE_WEBHOOK_SECRET));
});
test('rejects redirects, oversized responses and unresponsive transports', async () => {
  await assert.rejects(requestJson('https://fieldclose.app', {}, async () => new Response('', { status: 302 })));
  await assert.rejects(requestJson('https://fieldclose.app', {}, async () => json({ huge: 'x'.repeat(9000) })));
  let signal;
  await assert.rejects(requestJson('https://fieldclose.app', {}, async (_url, options) => { signal = options.signal; return new Promise(() => {}); }, 10));
  assert.equal(signal.aborted, true);
});
test('Stripe identity is read-only, fixed-origin, exact-match and aggregate-only', async () => {
  const result = await verifyStripeIdentity(env, 'acct_expected', async (url, options) => {
    assert.equal(url, 'https://api.stripe.com/v1/account');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, `Bearer ${env.STRIPE_SECRET_KEY}`);
    assert.equal(options.redirect, 'error');
    return json({ id: 'acct_expected', email: 'private@example.test', business_profile: { name: 'Private' } });
  });
  assert.deepEqual(result, { check: 'stripe_identity', passed: true });
  assert.equal((await verifyStripeIdentity(env, 'acct_other', async () => json({ id: 'acct_expected' }))).passed, false);
  const failed = await verifyStripeIdentity(env, 'acct_expected', async () => { throw new Error(env.STRIPE_SECRET_KEY); });
  assert.ok(!JSON.stringify(failed).includes(env.STRIPE_SECRET_KEY));
});

function r2Fixture(overrides = {}) {
  const calls = [];
  const records = [];
  let stored = null;
  const operations = {
    async put(input) {
      calls.push('put');
      assert.equal(input.Bucket, BUCKET);
      assert.match(input.Key, /^private\/deployment-verification\/[a-f0-9-]{36}\.png$/);
      assert.equal(input.IfNoneMatch, '*');
      assert.equal(input.ContentType, 'image/png');
      assert.equal(input.CacheControl, 'no-store');
      assert.deepEqual(input.Body.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      for (let offset = 8; offset < input.Body.length;) {
        const length = input.Body.readUInt32BE(offset);
        const chunk = input.Body.subarray(offset + 4, offset + 8 + length);
        assert.equal(crc32(chunk), input.Body.readUInt32BE(offset + 8 + length));
        if (chunk.subarray(0, 4).toString() === 'IDAT') assert.equal(inflateSync(chunk.subarray(4)).length, 3);
        offset += 12 + length;
      }
      assert.ok(records.length > 0 && records[0].cleanupRequired);
      assert.equal(records[0].key, input.Key);
      stored = { metadata: { ...input.Metadata }, body: Buffer.from(input.Body), contentLength: input.Body.length, contentType: input.ContentType, key: input.Key };
    },
    async get(input) { calls.push('get'); assert.equal(input.Key, stored.key); return stored; },
    async head(input) { calls.push('head'); if (!stored) throw statusError(404); assert.equal(input.Key, stored.key); return stored; },
    async delete(input) { calls.push('delete'); assert.equal(input.Key, stored.key); stored = null; },
  };
  const request = async (url, options) => {
    calls.push('anonymous');
    assert.equal(url, `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${stored.key}`);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(Object.hasOwn(options.headers, 'Authorization'), false);
    assert.ok(!url.includes('?')); return new Response('', { status: 403 });
  };
  const receiptFactory = async (_dir, initial) => {
    assert.equal(initial.bucket, BUCKET);
    return { async save(record) { records.push(structuredClone(record)); }, async close() { calls.push('receipt_closed'); } };
  };
  return { calls, records, operations, request, receiptFactory, get stored() { return stored; }, ...overrides };
}

test('R2 conditionally writes one fresh PNG, verifies bytes, denies anonymous read and deletes exact owned key', async () => {
  const fixture = r2Fixture();
  const result = await verifyR2(env, '/unused-private-directory', fixture);
  assert.deepEqual(fixture.calls, ['put', 'get', 'anonymous', 'head', 'delete', 'head', 'receipt_closed']);
  assert.equal(result.passed, true); assert.equal(result.cleanupVerified, true); assert.equal(result.cleanupRequired, false);
  assert.equal(result.publicDomainConfigurationVerified, false);
  assert.equal(fixture.records.at(-1).phase, 'cleaned');
  assert.ok(!JSON.stringify(result).includes(fixture.records[0].key));
  assert.ok(!JSON.stringify(result).includes(env.R2_SECRET_ACCESS_KEY));
});
test('conditional write conflict never reads or deletes a pre-existing object', async () => {
  const fixture = r2Fixture();
  fixture.operations.put = async () => { fixture.calls.push('put'); throw statusError(412); };
  const result = await verifyR2(env, '/unused', fixture);
  assert.deepEqual(fixture.calls, ['put', 'receipt_closed']);
  assert.equal(result.passed, false); assert.equal(result.cleanupRequired, false);
  assert.equal(result.reason, 'conditional_key_conflict');
});
test('failed read still cleans up only this freshly owned object', async () => {
  const fixture = r2Fixture();
  fixture.operations.get = async () => { fixture.calls.push('get'); throw new Error(env.R2_SECRET_ACCESS_KEY); };
  const result = await verifyR2(env, '/unused', fixture);
  assert.equal(result.passed, false); assert.equal(result.cleanupVerified, true);
  assert.deepEqual(fixture.calls, ['put', 'get', 'head', 'delete', 'head', 'receipt_closed']);
});
test('byte mismatch fails and still verifies cleanup', async () => {
  const fixture = r2Fixture();
  fixture.operations.get = async () => ({ ...fixture.stored, body: Buffer.from('wrong') });
  const result = await verifyR2(env, '/unused', fixture);
  assert.equal(result.passed, false); assert.equal(result.cleanupVerified, true); assert.equal(result.reason, 'roundtrip_mismatch');
});
test('anonymous access success or redirect fails and still cleans up', async () => {
  for (const status of [200, 302, 404]) {
    const fixture = r2Fixture({ request: async () => new Response('', { status }) });
    const result = await verifyR2(env, '/unused', fixture);
    assert.equal(result.passed, false); assert.equal(result.cleanupVerified, true); assert.equal(result.reason, 'anonymous_access_not_denied');
  }
});
test('lost upload acknowledgement cleans an owned committed object but remains a failed verification', async () => {
  const fixture = r2Fixture();
  const originalPut = fixture.operations.put;
  fixture.operations.put = async input => { await originalPut(input); throw new Error('uncertain'); };
  const result = await verifyR2(env, '/unused', fixture);
  assert.equal(result.passed, false); assert.equal(result.cleanupVerified, true); assert.equal(result.reason, 'upload_outcome_uncertain');
  assert.deepEqual(fixture.calls, ['put', 'head', 'delete', 'head', 'receipt_closed']);
});
test('404 after uncertain PUT keeps cleanup required, because the timed-out request might still commit', async () => {
  const fixture = r2Fixture();
  fixture.operations.put = async () => { fixture.calls.push('put'); throw new Error('uncertain'); };
  const result = await verifyR2(env, '/unused', fixture);
  assert.equal(result.passed, false); assert.equal(result.cleanupRequired, true);
  assert.deepEqual(fixture.calls, ['put', 'head', 'receipt_closed']);
  assert.equal(fixture.records.at(-1).phase, 'cleanup_required');
});
test('ownership mismatch forbids delete and records exact private cleanup key', async () => {
  const fixture = r2Fixture();
  fixture.operations.head = async () => { fixture.calls.push('head'); return { ...fixture.stored, metadata: { ...fixture.stored.metadata, 'fieldclose-probe': 'different-owner' } }; };
  const result = await verifyR2(env, '/unused', fixture);
  assert.equal(result.passed, false); assert.equal(result.cleanupRequired, true);
  assert.equal(result.reason, 'cleanup_ownership_mismatch');
  assert.ok(!fixture.calls.includes('delete')); assert.ok(fixture.records.at(-1).key);
});
test('failed delete or missing post-delete 404 cannot claim cleanup', async () => {
  for (const mode of ['failed_delete', 'object_remains']) {
    const fixture = r2Fixture();
    fixture.operations.delete = async () => { if (mode === 'failed_delete') throw statusError(403); };
    const result = await verifyR2(env, '/unused', fixture);
    assert.equal(result.passed, false); assert.equal(result.cleanupRequired, true); assert.equal(result.cleanupVerified, false);
  }
});
test('receipt failure before upload prevents any provider request', async () => {
  const fixture = r2Fixture({ receiptFactory: async () => ({ async save() { throw new Error('disk full'); }, async close() {} }) });
  const result = await verifyR2(env, '/unused', fixture);
  assert.equal(result.passed, false); assert.equal(result.receiptSaved, false); assert.deepEqual(fixture.calls, []);
});
test('receipt persistence failure after PUT still triggers cleanup and fails overall', async () => {
  const fixture = r2Fixture();
  const initialFactory = fixture.receiptFactory;
  fixture.receiptFactory = async (...args) => {
    const writer = await initialFactory(...args);
    return { ...writer, async save(record) { if (record.phase === 'uploaded') throw new Error('disk full'); await writer.save(record); } };
  };
  const result = await verifyR2(env, '/unused', fixture);
  assert.equal(result.passed, false); assert.equal(result.cleanupVerified, true); assert.equal(result.receiptSaved, false);
});
test('receipt directory and exclusive owner-only file protect cleanup details', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'fieldclose-provider-test-')));
  try {
    await chmod(directory, 0o700);
    const record = { runId: 'fixture', key: 'private/fixture', cleanupRequired: true };
    const writer = await createReceipt(directory, record);
    await writer.save(record);
    await writer.save({ ...record, cleanupRequired: false }); await writer.close();
    const files = await readdir(directory); assert.equal(files.length, 1);
    const path = join(directory, files[0]);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).cleanupRequired, false);
    await assert.rejects(createReceipt(directory, record));
    await chmod(directory, 0o755);
    await assert.rejects(createReceipt(directory, { runId: 'other' }));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('receipt writer completes short writes before fsync and rejects a zero-length write', async () => {
  const record = { key: 'private/fixture', cleanupRequired: true };
  const written = [];
  let position = 0;
  let synced = false;
  await writeReceiptFile({
    async write(bytes, offset, length, destination) {
      assert.equal(destination, position); assert.equal(offset, position);
      const size = Math.min(7, length); written.push(bytes.subarray(offset, offset + size)); position += size;
      return { bytesWritten: size };
    },
    async sync() { synced = true; },
  }, record);
  assert.equal(synced, true); assert.ok(written.length > 1);
  assert.deepEqual(JSON.parse(Buffer.concat(written).toString()), record);
  await assert.rejects(writeReceiptFile({ async write() { return { bytesWritten: 0 }; }, async sync() { assert.fail('must not fsync incomplete record'); } }, record));
});
test('failed partial state write preserves the complete durable pre-upload cleanup key', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'fieldclose-provider-test-')));
  let writer;
  try {
    await chmod(directory, 0o700);
    const before = { runId: 'fixture', key: 'private/preserve-this-key', phase: 'upload_pending', cleanupRequired: true };
    const fileOps = {
      rename, unlink,
      async open(path, ...args) {
        const handle = await open(path, ...args);
        if (!path.endsWith('.tmp')) return handle;
        let writes = 0;
        return {
          async write(bytes, offset, length, position) {
            if (writes++) throw new Error('simulated full disk');
            return handle.write(bytes, offset, Math.min(5, length), position);
          },
          sync: () => handle.sync(), close: () => handle.close(),
        };
      },
    };
    writer = await createReceipt(directory, before, fileOps);
    await writer.save(before);
    await assert.rejects(writer.save({ ...before, phase: 'cleaned', cleanupRequired: false }));
    assert.deepEqual(await readdir(directory), ['r2-probe-fixture.json']);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'r2-probe-fixture.json'), 'utf8')), before);
  } finally { await writer?.close(); await rm(directory, { recursive: true, force: true }); }
});
test('failed rename preserves the previous receipt and removes the incomplete replacement', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'fieldclose-provider-test-')));
  let writer;
  try {
    await chmod(directory, 0o700);
    const before = { runId: 'fixture', key: 'private/preserve-this-key', cleanupRequired: true };
    writer = await createReceipt(directory, before, { open, unlink, async rename() { throw new Error('simulated rename failure'); } });
    await writer.save(before);
    await assert.rejects(writer.save({ ...before, cleanupRequired: false }));
    assert.deepEqual(await readdir(directory), ['r2-probe-fixture.json']);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'r2-probe-fixture.json'), 'utf8')), before);
  } finally { await writer?.close(); await rm(directory, { recursive: true, force: true }); }
});
test('CLI help does not load SDK or environment files; setup errors do not echo credentials', () => {
  const script = fileURLToPath(new URL('./verify-providers.mjs', import.meta.url));
  const output = spawnSync(process.execPath, [script, '--help'], { cwd: '/', env: { ...process.env, ...env }, encoding: 'utf8' });
  assert.equal(output.status, 0); assert.match(output.stdout, /Usage/);
  const blocked = spawnSync(process.execPath, [script, '--webhooks'], { env: { ...process.env, ...env, APP_URL: 'invalid' }, encoding: 'utf8' });
  assert.equal(blocked.status, 1);
  for (const secret of [env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET, env.R2_SECRET_ACCESS_KEY]) assert.ok(!(output.stdout + output.stderr + blocked.stdout + blocked.stderr).includes(secret));
});

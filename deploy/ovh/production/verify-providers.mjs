import { createHash, createHmac, randomUUID } from 'node:crypto';
import { getDefaultResultOrder } from 'node:dns';
import { getDefaultAutoSelectFamily } from 'node:net';
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROBE_TYPE = 'fieldclose.deployment_probe';
export const BUCKET = 'fieldclose-production-photos';
const ORIGIN = 'https://fieldclose.app';
const TARGETS = Object.freeze({ candidate: 'http://127.0.0.1:3001', public: ORIGIN });
const TIMEOUT_MS = 15_000;
const BODY_LIMIT = 8192;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const PNG_HASH = createHash('sha256').update(PNG).digest('hex');
const fail = code => Object.assign(new Error(code), { probeCode: code });

export function parseArgs(args) {
  const options = { target: 'candidate', webhooks: false, r2: false, account: null, receiptDir: null, help: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (seen.has(arg)) throw fail('duplicate_option');
    seen.add(arg);
    if (arg === '--help') options.help = true;
    else if (arg === '--webhooks') options.webhooks = true;
    else if (arg === '--r2-roundtrip') options.r2 = true;
    else if (['--stripe-identity', '--webhook-target', '--receipt-dir'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw fail('missing_option_value');
      if (arg === '--stripe-identity') options.account = value;
      if (arg === '--webhook-target') options.target = value;
      if (arg === '--receipt-dir') options.receiptDir = value;
    } else throw fail('unknown_option');
  }
  if (!Object.hasOwn(TARGETS, options.target)) throw fail('invalid_target');
  if (options.account && !/^acct_[A-Za-z0-9]+$/.test(options.account)) throw fail('invalid_expected_account');
  if (options.r2 && (!options.receiptDir || !isAbsolute(options.receiptDir))) throw fail('private_receipt_directory_required');
  if (!options.webhooks && seen.has('--webhook-target')) throw fail('unused_webhook_target');
  if (!options.r2 && options.receiptDir) throw fail('unused_receipt_directory');
  if (!options.webhooks && !options.r2 && !options.account) options.help = true;
  return options;
}

export function validateProbeEnvironment(env, options) {
  if (env.DEPLOYMENT_ENV !== 'production' || env.APP_URL !== ORIGIN || env.AUTH_URL !== ORIGIN) throw fail('invalid_production_boundary');
  if (/network-guard/.test(env.NODE_OPTIONS || '')) throw fail('synthetic_guard_present');
  if ((options.webhooks || options.account) && !/^(?:rk|sk)_live_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY || '')) throw fail('live_stripe_key_required');
  if (options.webhooks) {
    for (const key of ['STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET']) {
      if (!/^whsec_[A-Za-z0-9]+$/.test(env[key]?.trim() || '')) throw fail('webhook_secrets_required');
    }
    if (env.STRIPE_WEBHOOK_SECRET.trim() === env.STRIPE_CONNECT_WEBHOOK_SECRET.trim()) throw fail('distinct_webhook_secrets_required');
  }
  if (options.r2 && (!/^[a-f0-9]{32}$/.test(env.R2_ACCOUNT_ID || '') || env.R2_BUCKET !== BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY)) throw fail('invalid_r2_boundary');
}

async function deadline(work, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(fail('request_timeout')); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function boundedBytes(body, limit = BODY_LIMIT) {
  if (!body) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for await (const part of body) {
    const bytes = Buffer.from(part);
    size += bytes.length;
    if (size > limit) throw fail('response_too_large');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

// Neither raw error messages nor response bodies leave this module's check results.
export async function requestJson(url, options, request = fetch, timeoutMs = TIMEOUT_MS) {
  return deadline(async signal => {
    const response = await request(url, { ...options, redirect: 'error', signal });
    if (response.status >= 300 && response.status < 400) throw fail('redirect_rejected');
    const bytes = await boundedBytes(response.body);
    let body;
    try { body = JSON.parse(bytes.toString('utf8')); } catch { throw fail('invalid_json_response'); }
    return { status: response.status, body };
  }, timeoutMs);
}

export async function verifyStripeIdentity(env, expectedAccount, request = fetch) {
  try {
    const result = await requestJson('https://api.stripe.com/v1/account', {
      method: 'GET', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, Accept: 'application/json' },
    }, request);
    return { check: 'stripe_identity', passed: result.status === 200 && result.body?.id === expectedAccount };
  } catch { return { check: 'stripe_identity', passed: false, reason: 'request_failed' }; }
}

export const WEBHOOK_CASES = Object.freeze([
  { name: 'billing_platform_ignored', path: '/api/billing/webhook', secret: 'platform', account: false, expected: 200 },
  { name: 'legacy_platform_ignored', path: '/api/stripe/webhook', secret: 'platform', account: false, expected: 200 },
  { name: 'connect_ignored', path: '/api/stripe/webhook', secret: 'connect', account: true, expected: 200 },
  { name: 'billing_invalid_signature', path: '/api/billing/webhook', secret: 'invalid', account: false, expected: 400, error: 'Invalid webhook signature' },
  { name: 'connect_invalid_signature', path: '/api/stripe/webhook', secret: 'invalid', account: true, expected: 400, error: 'Invalid webhook signature' },
  { name: 'platform_rejects_connect_scope', path: '/api/billing/webhook', secret: 'platform', account: true, expected: 400, error: 'Webhook account scope mismatch' },
  { name: 'connect_rejects_platform_scope', path: '/api/stripe/webhook', secret: 'connect', account: false, expected: 400, error: 'Webhook account scope mismatch' },
].map(Object.freeze));

export async function verifyWebhooks(env, target = 'candidate', request = fetch) {
  if (!Object.hasOwn(TARGETS, target)) throw fail('invalid_target');
  const results = [];
  for (const probe of WEBHOOK_CASES) {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: `evt_fieldclose_probe_${randomUUID().replaceAll('-', '')}`, object: 'event',
      type: PROBE_TYPE, created: timestamp, livemode: true, data: { object: {} },
      ...(probe.account ? { account: 'acct_fieldclose_deployment_probe' } : {}),
    });
    const secret = probe.secret === 'platform' ? env.STRIPE_WEBHOOK_SECRET.trim() : env.STRIPE_CONNECT_WEBHOOK_SECRET.trim();
    const signature = probe.secret === 'invalid' ? '0'.repeat(64) : createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
    try {
      const response = await requestJson(`${TARGETS[target]}${probe.path}`, {
        method: 'POST', headers: {
          'Content-Type': 'application/json', 'Stripe-Signature': `t=${timestamp},v1=${signature}`,
          ...(target === 'candidate' ? { Host: 'fieldclose.app', 'X-Forwarded-Proto': 'https' } : {}),
        }, body: payload,
      }, request);
      const passed = response.status === probe.expected && (probe.expected === 200
        ? response.body?.received === true && response.body?.ignored === true
        : response.body?.error === probe.error);
      results.push({ check: probe.name, passed, status: response.status });
    } catch { results.push({ check: probe.name, passed: false, reason: 'request_failed' }); }
  }
  return { check: 'webhook_signature_and_ignore_paths', target, passed: results.every(result => result.passed), stripeOriginDeliveryVerified: false, cases: results };
}

export async function writeReceiptFile(file, record) {
  const bytes = Buffer.from(JSON.stringify(record, null, 2) + '\n');
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await file.write(bytes, offset, bytes.length - offset, offset);
    if (!Number.isInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > bytes.length - offset) throw fail('receipt_write_failed');
    offset += bytesWritten;
  }
  await file.sync();
}

export async function createReceipt(directory, record, fileOps = { open, rename, unlink }) {
  const resolved = resolve(directory);
  const info = await lstat(resolved);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o700 || info.uid !== process.getuid?.() || await realpath(resolved) !== resolved) throw fail('receipt_directory_not_private');
  const path = join(resolved, `r2-probe-${record.runId}.json`);
  const directoryHandle = await fileOps.open(resolved, 'r');
  let initialHandle;
  try { initialHandle = await fileOps.open(path, 'wx', 0o600); }
  catch (error) { await directoryHandle.close(); throw error; }
  return {
    async save(next) {
      if (initialHandle) {
        // The initial exclusive claim must be fully durable before any upload.
        await writeReceiptFile(initialHandle, next);
        await directoryHandle.sync();
        await initialHandle.close(); initialHandle = null;
        return;
      }
      // Never truncate the durable cleanup key. A crash/error leaves either the
      // previous complete receipt or the next complete receipt at the stable path.
      const temporary = `${path}.${randomUUID()}.tmp`;
      let file;
      try {
        file = await fileOps.open(temporary, 'wx', 0o600);
        await writeReceiptFile(file, next);
        await file.close(); file = null;
        await fileOps.rename(temporary, path);
        await directoryHandle.sync();
      } finally {
        await file?.close();
        await fileOps.unlink(temporary).catch(() => {});
      }
    },
    async close() { try { await initialHandle?.close(); } finally { await directoryHandle.close(); } },
  };
}

function httpStatus(error) { return error?.$metadata?.httpStatusCode; }
function ownsObject(object, runId) {
  return object?.metadata?.['fieldclose-probe'] === runId && object?.metadata?.sha256 === PNG_HASH && object?.contentLength === PNG.length;
}

// Dependency injection is only for offline tests. CLI creates its pinned S3 adapter below.
export async function verifyR2(env, receiptDirectory, { operations, request = fetch, receiptFactory = createReceipt } = {}) {
  const runId = randomUUID();
  const key = `private/deployment-verification/${runId}.png`;
  const receipt = { version: 1, runId, bucket: BUCKET, key, startedAt: new Date().toISOString(), phase: 'prepared', cleanupRequired: false };
  const writer = await receiptFactory(receiptDirectory, receipt);
  let possibleWrite = false;
  let passed = false;
  let reason = 'roundtrip_failed';
  let cleanupVerified = false;
  let receiptFailed = false;
  const save = async () => { try { await writer.save(receipt); } catch { receiptFailed = true; throw fail('receipt_write_failed'); } };
  try {
    // Persist exact cleanup instructions before the only write can begin.
    receipt.phase = 'upload_pending'; receipt.cleanupRequired = true;
    await save();
    possibleWrite = true;
    try {
      await operations.put({ Bucket: BUCKET, Key: key, Body: PNG, ContentType: 'image/png', ContentLength: PNG.length, CacheControl: 'no-store', IfNoneMatch: '*', Metadata: { 'fieldclose-probe': runId, sha256: PNG_HASH } });
    } catch (error) {
      if (httpStatus(error) === 412) { possibleWrite = false; receipt.cleanupRequired = false; reason = 'conditional_key_conflict'; }
      else reason = 'upload_outcome_uncertain';
      throw fail(reason);
    }
    receipt.phase = 'uploaded'; await save();
    const read = await operations.get({ Bucket: BUCKET, Key: key });
    if (!ownsObject(read, runId) || read.contentType !== 'image/png' || !Buffer.isBuffer(read.body) || !read.body.equals(PNG)) throw fail('roundtrip_mismatch');
    const anonymousStatus = await deadline(async signal => {
      const response = await request(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`, { method: 'GET', redirect: 'error', signal, headers: { 'Cache-Control': 'no-store' } });
      await response.body?.cancel();
      return response.status;
    });
    if (![401, 403].includes(anonymousStatus)) throw fail('anonymous_access_not_denied');
    passed = true;
  } catch (error) {
    if (['roundtrip_mismatch', 'anonymous_access_not_denied', 'receipt_write_failed'].includes(error?.probeCode)) reason = error.probeCode;
  } finally {
    if (possibleWrite) {
      try {
        // Only delete a key with this run's ownership marker, including after an uncertain PUT.
        const before = await operations.head({ Bucket: BUCKET, Key: key });
        if (!ownsObject(before, runId)) throw fail('cleanup_ownership_mismatch');
        await operations.delete({ Bucket: BUCKET, Key: key });
        try { await operations.head({ Bucket: BUCKET, Key: key }); throw fail('cleanup_object_still_present'); }
        catch (error) { if (httpStatus(error) !== 404) throw error; }
        cleanupVerified = true;
      } catch (error) {
        // A failed/uncertain PUT can still be in flight after a 404; never call it clean.
        reason = error?.probeCode === 'cleanup_ownership_mismatch' ? 'cleanup_ownership_mismatch' : 'cleanup_not_verified';
      }
      receipt.cleanupRequired = !cleanupVerified;
    } else receipt.cleanupRequired = false;
    receipt.phase = cleanupVerified ? 'cleaned' : possibleWrite ? 'cleanup_required' : 'not_created';
    receipt.completedAt = new Date().toISOString();
    receipt.passed = passed && cleanupVerified && !receiptFailed;
    try { await save(); } catch { /* Return failure without exposing local paths or provider data. */ }
    try { await writer.close(); } catch { receiptFailed = true; }
  }
  return { check: 'r2_private_object_roundtrip', passed: passed && cleanupVerified && !receiptFailed, cleanupVerified, cleanupRequired: receipt.cleanupRequired, receiptSaved: !receiptFailed, ...(passed && cleanupVerified && !receiptFailed ? {} : { reason }), publicDomainConfigurationVerified: false };
}

export function createR2Operations(env) {
  // Run from the installed application directory; use its already-installed runtime SDK.
  const require = createRequire(join(process.cwd(), 'package.json'));
  const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, forcePathStyle: true,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    maxAttempts: 1, followRegionRedirects: false,
    requestHandler: { connectionTimeout: 5000, requestTimeout: TIMEOUT_MS, throwOnRequestTimeout: true },
  });
  const send = (Command, input, readBody = false) => deadline(async signal => {
    const output = await client.send(new Command(input), { abortSignal: signal });
    return { metadata: output.Metadata, contentLength: output.ContentLength, contentType: output.ContentType, ...(readBody ? { body: await boundedBytes(output.Body, PNG.length) } : {}) };
  });
  return {
    put: input => send(PutObjectCommand, input), get: input => send(GetObjectCommand, input, true),
    head: input => send(HeadObjectCommand, input), delete: input => send(DeleteObjectCommand, input),
    close: () => client.destroy(),
  };
}

const HELP = `Usage (run from installed app directory with approved runtime environment):
  node --dns-result-order=ipv4first --no-network-family-autoselection verify-providers.mjs [options]
  --stripe-identity acct_EXPECTED   Read current Stripe account; compare only its ID
  --webhooks                      Seven signed unknown-event/invalid-signature probes
  --webhook-target candidate|public  Fixed loopback:3001 or https://fieldclose.app
  --r2-roundtrip --receipt-dir /absolute/private/directory
                                  One conditional UUID PNG write/read/deny/delete check
The receipt directory must already exist, be owned by this user, mode 0700, and have no symlink path.
No secret files are read. No real Stripe event, charge, email, or application DB write is generated.
Webhook probes do not prove Stripe-origin delivery. R2 denial tests the S3 endpoint, not public-domain settings.
Provider failures and cleanup uncertainty cause exit 1. Keep receipts private; inspect any cleanupRequired receipt.`;

export async function main(args = process.argv.slice(2), env = process.env) {
  let operations;
  try {
    const options = parseArgs(args);
    if (options.help) { console.log(HELP); return 0; }
    validateProbeEnvironment(env, options);
    if (getDefaultResultOrder() !== 'ipv4first' || getDefaultAutoSelectFamily()) throw fail('ipv4_egress_configuration_required');
    const results = [];
    // Resolve optional runtime dependency before any provider calls.
    if (options.r2) operations = createR2Operations(env);
    if (options.account) results.push(await verifyStripeIdentity(env, options.account));
    if (options.webhooks) results.push(await verifyWebhooks(env, options.target));
    if (options.r2) results.push(await verifyR2(env, options.receiptDir, { operations }));
    console.log(JSON.stringify({ passed: results.every(result => result.passed), results }, null, 2));
    return results.every(result => result.passed) ? 0 : 1;
  } catch (error) {
    const allowed = ['duplicate_option', 'missing_option_value', 'unknown_option', 'invalid_target', 'invalid_expected_account', 'private_receipt_directory_required', 'unused_webhook_target', 'unused_receipt_directory', 'invalid_production_boundary', 'synthetic_guard_present', 'live_stripe_key_required', 'webhook_secrets_required', 'distinct_webhook_secrets_required', 'invalid_r2_boundary', 'receipt_directory_not_private', 'ipv4_egress_configuration_required'];
    console.error(JSON.stringify({ passed: false, reason: allowed.includes(error?.probeCode) ? error.probeCode : 'verification_setup_failed', valuesOmitted: true }));
    return 1;
  } finally { operations?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();

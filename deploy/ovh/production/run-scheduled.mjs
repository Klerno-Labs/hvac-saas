import { pathToFileURL } from 'node:url';

const tasks = {
  recurring: '/api/recurring/generate',
  collections: '/api/collections/run',
  appointments: '/api/appointments/reminders',
};
const counters = ['generated', 'generatedMembershipVisits', 'organizationsProcessed', 'attemptsCreated', 'attemptsSkipped', 'channelsAccepted', 'sent', 'errors', 'needsReview'];
const requiredCounters = {
  recurring: ['generated', 'generatedMembershipVisits'],
  collections: ['organizationsProcessed', 'attemptsCreated', 'attemptsSkipped', 'channelsAccepted', 'errors', 'needsReview'],
  appointments: ['sent', 'errors'],
};

export function inspectScheduledResponse(status, body, task) {
  const validObject = typeof body === 'object' && body !== null && !Array.isArray(body);
  const validCount = key => Number.isSafeInteger(body[key]) && body[key] >= 0;
  const result = {};
  for (const key of counters) if (validObject && validCount(key)) result[key] = body[key];
  const completeCounts = validObject && Object.hasOwn(requiredCounters, task)
    && requiredCounters[task].every(key => Object.hasOwn(body, key) && validCount(key))
    && counters.every(key => !Object.hasOwn(body, key) || validCount(key));
  const passed = status === 200 && completeCounts && body.success === true
    && (!Object.hasOwn(body, 'errors') || body.errors === 0)
    && (!Object.hasOwn(body, 'needsReview') || body.needsReview === 0)
    && (task !== 'recurring' || body.generatedMembershipVisits <= body.generated);
  return { passed, counters: result };
}

export async function runScheduled(task, env = process.env, request = fetch) {
  const started = Date.now();
  const result = { task: Object.hasOwn(tasks, task) ? task : 'invalid', startedAt: new Date(started).toISOString(), passed: false, reviewRequired: true };
  const secret = [env.CRON_SECRET, env.COLLECTIONS_CRON_SECRET].find(value => typeof value === 'string' && value.length >= 32);
  if (!Object.hasOwn(tasks, task) || env.DEPLOYMENT_ENV !== 'production' || env.SCHEDULED_TASKS_ENABLED !== 'true' || !secret || secret.length < 32) {
    return { ...result, reason: 'configuration_paused_or_invalid', elapsedMs: Date.now() - started };
  }
  try {
    const response = await request(`http://127.0.0.1:3001${tasks[task]}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(300_000),
      headers: { Authorization: `Bearer ${secret}`, Host: 'fieldclose.app', 'X-Forwarded-Proto': 'https' },
    });
    result.httpStatus = response.status;
    const text = await response.text();
    if (text.length > 8192) throw new Error('Unexpected response size');
    const inspection = inspectScheduledResponse(response.status, JSON.parse(text), task);
    return { ...result, ...inspection, reviewRequired: !inspection.passed, elapsedMs: Date.now() - started };
  } catch {
    // A timed-out delivery may have succeeded. Never replay an uncertain batch.
    return { ...result, reason: 'request_or_response_failed_no_retry', elapsedMs: Date.now() - started };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runScheduled(process.argv[2]);
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
}

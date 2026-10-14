// Isolated test process only. No provider request may leave this process.
const allowed = value => {
  try { const u = new URL(value); return ['127.0.0.1','localhost','[::1]'].includes(u.hostname) } catch { return false }
}
const originalFetch = globalThis.fetch
globalThis.fetch = function(input,...rest) {
  if (!allowed(typeof input === 'string' || input instanceof URL ? String(input) : input.url)) throw new Error('SIMULATION_EXTERNAL_NETWORK_BLOCKED')
  return originalFetch.call(this,input,...rest)
}
for (const name of ['node:http','node:https']) {
  const client = require(name)
  const request = client.request
  client.request = function(input,...rest) {
    const host = typeof input === 'string' || input instanceof URL ? new URL(input).hostname : input?.hostname || input?.host || 'localhost'
    if (!['127.0.0.1','localhost','::1'].includes(host)) throw new Error('SIMULATION_EXTERNAL_NETWORK_BLOCKED')
    return request.call(this,input,...rest)
  }
  client.get = function(...args) { const req=client.request(...args); req.end(); return req }
}

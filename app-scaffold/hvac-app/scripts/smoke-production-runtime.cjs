/** Run after build and npm prune --omit=dev. Uses only Node built-ins. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { setTimeout: delay } = require('node:timers/promises')

const port = 3217
const origin = `http://127.0.0.1:${port}`
const buildOnly = ['typescript', 'shadcn', 'braces', 'micromatch']
function assertPruned() {
  for (const name of buildOnly) assert.equal(fs.existsSync(`node_modules/${name}`), false, `${name} must not be installed in the production runtime`)
}

async function main() {
  assertPruned()
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
  })
  let exited = false
  let spawnError
  server.on('exit', () => { exited = true })
  server.on('error', error => { spawnError = error })
  try {
    let ready = false
    for (let attempt = 0; attempt < 40; attempt++) {
      if (spawnError) throw spawnError
      assert.equal(exited, false, 'Production server exited before becoming ready')
      try {
        const response = await fetch(origin, { signal: AbortSignal.timeout(1000) })
        if (response.status === 200) { ready = true; break }
      } catch { /* bounded startup retry */ }
      await delay(250)
    }
    assert.equal(ready, true, 'Production server did not start within the bounded probe period')
    for (const path of ['/', '/resources', '/resources/hvac-invoice-template', '/tools/hvac-job-pricing-calculator', '/login']) {
      const response = await fetch(origin + path, { signal: AbortSignal.timeout(5000), redirect: 'manual' })
      assert.equal(response.status, 200, `${path} must render with only production dependencies`)
      if (path === '/login') assert.match(response.headers.get('x-robots-tag') || '', /noindex/)
    }
    const privatePage = await fetch(origin + '/dashboard', { signal: AbortSignal.timeout(5000), redirect: 'manual' })
    assert.equal(privatePage.status, 307, 'Anonymous workspace request must redirect')
    assert.match(privatePage.headers.get('location') || '', /\/login/)
    assert.match(privatePage.headers.get('cache-control') || '', /private.*no-store/)
    const health = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(5000) })
    assert.equal(health.status, 200, 'Configured CI database and runtime must be healthy')
    assertPruned() // Also catches Next silently reinstalling TypeScript on startup.
    console.log('Production-only runtime: public rendering, auth boundary, database health and no development-package reinstall passed.')
  } finally {
    if (!exited) {
      server.kill('SIGTERM')
      await Promise.race([once(server, 'exit'), delay(5000)])
      if (!exited) server.kill('SIGKILL')
    }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })

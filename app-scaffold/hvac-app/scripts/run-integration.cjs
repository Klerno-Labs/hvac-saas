const { spawnSync } = require('node:child_process')
const url = process.env.TEST_DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_test')) {
  console.error('Set TEST_DATABASE_URL to a disposable database ending in _test.'); process.exit(1)
}
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'], {stdio: 'inherit', env: {...process.env, DATABASE_URL: url}})
process.exit(result.status ?? 1)

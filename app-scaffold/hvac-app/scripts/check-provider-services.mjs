#!/usr/bin/env node
// Node 24 strips the types from this standalone module. No .env file is loaded.
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3'
import { inspectProviders } from '../lib/provider-readiness.ts'

if (process.argv.includes('--help')) {
  console.log('Read-only provider checks using the current process environment. Does not load .env files, send email, charge cards, write objects, or certify unattended readiness. Output contains no credentials, customer records, or raw provider errors. Exit 1 means a blocked/unverified prerequisite remains.')
} else {
  try {
    const checks = await inspectProviders({ env: process.env, checkBucket: async env => {
      if (!/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID ?? '')) throw new Error('Invalid R2 account')
      const client = new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
        maxAttempts: 1, requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 } })
      try { await client.send(new HeadBucketCommand({ Bucket: env.R2_BUCKET })) }
      finally { client.destroy() }
    } })
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), readOnly: true, certifiesLaunch: false, checks }, null, 2))
    if (checks.some(check => check.status !== 'passed')) process.exitCode = 1
  } catch {
    console.error('Provider inspection could not finish. No raw provider errors or environment values were printed.')
    process.exitCode = 1
  }
}

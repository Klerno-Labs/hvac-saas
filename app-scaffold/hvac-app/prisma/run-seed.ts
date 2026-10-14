import { seedPlanLimits, disconnectSeed } from './seed'
seedPlanLimits().catch((error) => { console.error(error); process.exitCode = 1 }).finally(disconnectSeed)

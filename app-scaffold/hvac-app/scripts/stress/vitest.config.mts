import { defineConfig } from 'vitest/config'
import path from 'node:path'
export default defineConfig({test:{environment:'node',include:['scripts/stress/*.scenario.ts'],testTimeout:180000,hookTimeout:180000,fileParallelism:false},resolve:{alias:{'@':path.resolve(import.meta.dirname,'../..')}}})

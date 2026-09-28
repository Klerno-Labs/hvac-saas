import { defineConfig } from 'vitest/config'
import path from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: process.env.TEST_DATABASE_URL ? ['**/*.integration.test.ts'] : ['**/*.test.ts'],
    exclude: process.env.TEST_DATABASE_URL ? ['node_modules/**'] : ['node_modules/**', '**/*.integration.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})

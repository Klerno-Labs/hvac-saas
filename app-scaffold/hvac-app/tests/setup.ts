import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Clear rendered DOM between tests so RTL queries don't leak across cases.
afterEach(() => {
  cleanup()
})

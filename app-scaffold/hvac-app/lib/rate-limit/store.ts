export type RateLimitEntry = { count: number; resetsAt: number }

export interface RateLimitStore {
  hit(key: string, windowSeconds: number): Promise<RateLimitEntry> | RateLimitEntry
}

export class MemoryRateLimitStore implements RateLimitStore {
  private map = new Map<string, RateLimitEntry>()

  async hit(key: string, windowSeconds: number): Promise<RateLimitEntry> {
    const now = Date.now()
    const existing = this.map.get(key)
    if (!existing || existing.resetsAt <= now) {
      const fresh: RateLimitEntry = { count: 1, resetsAt: now + windowSeconds * 1000 }
      this.map.set(key, fresh)
      return fresh
    }
    existing.count += 1
    return existing
  }

  reset(): void {
    this.map.clear()
  }
}

let store: RateLimitStore = new MemoryRateLimitStore()

export function getRateLimitStore(): RateLimitStore {
  return store
}

export function setRateLimitStore(next: RateLimitStore): void {
  store = next
}

export function resetRateLimitStore(): void {
  store = new MemoryRateLimitStore()
}

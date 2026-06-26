export function bookingPublicUrl(baseUrl: string, slug: string | null): string | null {
  if (!slug) return null
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  return `${base}/book/${slug}`
}

export function partitionBookingRequests<T extends { status: string }>(
  list: T[]
): { newRequests: T[]; handledRequests: T[] } {
  return {
    newRequests: list.filter((r) => r.status === 'new'),
    handledRequests: list.filter((r) => r.status !== 'new'),
  }
}

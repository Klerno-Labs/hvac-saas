export function bookingPublicUrl(baseUrl: string, slug: string | null | undefined): string | null {
  if (!slug) return null
  return `${baseUrl.replace(/\/$/, '')}/book/${slug}`
}

export function partitionBookingRequests<T extends { status: string }>(list: T[]): {
  newRequests: T[]
  handledRequests: T[]
} {
  return {
    newRequests: list.filter((r) => r.status === 'new'),
    handledRequests: list.filter((r) => r.status !== 'new'),
  }
}

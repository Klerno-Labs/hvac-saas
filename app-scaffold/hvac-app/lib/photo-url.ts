/** Stored private references are never sent directly to the browser as object URLs. */
export function photoReadUrl(asset: { id: string; fileUrl: string }, portalToken?: string): string {
  if (asset.fileUrl.startsWith('r2://') || asset.fileUrl.startsWith('local-private://')) {
    return portalToken
      ? `/api/portal/${encodeURIComponent(portalToken)}/photos/${encodeURIComponent(asset.id)}`
      : `/api/photos/${encodeURIComponent(asset.id)}`
  }

  // Existing public records remain readable. This does not fetch arbitrary URLs
  // on the server or make legacy public objects private retroactively.
  if (/^https?:\/\//i.test(asset.fileUrl) || /^\/uploads\/[^/?#]+$/.test(asset.fileUrl)) {
    return asset.fileUrl
  }
  return ''
}

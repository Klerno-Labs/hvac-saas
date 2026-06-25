export function formatNoticeChannels(channels: string | null): string {
  if (!channels) return 'no channels'
  const parts = channels
    .split(',')
    .map((c) => {
      const t = c.trim()
      return t === 'sms' ? 'SMS' : t
    })
    .filter(Boolean)
  if (parts.length === 0) return 'no channels'
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1]
}

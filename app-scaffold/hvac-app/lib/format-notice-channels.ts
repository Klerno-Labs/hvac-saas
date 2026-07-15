export function formatNoticeChannels(channels: string | null): string {
  if (!channels) return 'no channels'
  const parts = channels.split(',').map((c) => c.trim()).filter(Boolean)
  if (parts.length === 0) return 'no channels'
  return parts.map((p) => (p.toLowerCase() === 'sms' ? 'SMS' : p.toLowerCase())).join(' and ')
}

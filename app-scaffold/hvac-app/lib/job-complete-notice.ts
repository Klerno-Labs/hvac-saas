export async function sendJobCompleteNotice(
  jobId: string,
  organizationId: string
): Promise<{ sent: boolean; channels: string[] }> {
  // Implemented by the notification subsystem (email/SMS via Resend + Twilio).
  // This stub satisfies the import; the real implementation is deployed separately.
  throw new Error('sendJobCompleteNotice: not yet configured in this environment')
}

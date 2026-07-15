// Sending logic is implemented server-side in the job-complete-notice feature.
export async function sendJobCompleteNotice(
  _jobId: string,
  _organizationId: string,
): Promise<{ sent: boolean; channels: string }> {
  throw new Error('sendJobCompleteNotice: not yet implemented in this environment')
}

/** Accounting providers are not implemented. Fail explicitly rather than
 * manufacturing remote IDs or marking local records as externally synced. */
export async function runAccountingSync(_organizationId: string, _userId?: string): Promise<{customersProcessed: number; invoicesProcessed: number; paymentsProcessed: number; errors: number}> {
  throw new Error('Accounting sync is not available yet. Export your records for your accountant.')
}

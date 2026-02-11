/**
 * E2E test setup – authenticates against M365 Developer Tenant.
 *
 * Requires environment variables:
 * - M365_TENANT_ID
 * - M365_CLIENT_ID
 * - M365_CLIENT_SECRET
 *
 * TODO (Phase 1): Implement E2E auth setup
 */
export async function setupE2E(): Promise<void> {
  const tenantId = process.env.M365_TENANT_ID;
  const clientId = process.env.M365_CLIENT_ID;
  const clientSecret = process.env.M365_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "E2E tests require M365_TENANT_ID, M365_CLIENT_ID, and M365_CLIENT_SECRET environment variables",
    );
  }
}

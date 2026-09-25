// Copied verbatim from koodo-bridge's functions/lib/roster.ts, per that
// file's own precedent (see access.ts in this directory) - shared
// entitlement-check logic, meant to be copied into every Iterverse
// service's own codebase rather than centralized. Keep in sync with the
// original if it ever changes there.
//
// One real difference from Reader's usage: `product` here is "kavita",
// not "reader" - this is the first non-Reader caller of this check.
// Whether iterverse_hub needs "kavita" pre-registered as a known product
// on its own side (vs. treating the field as free-form/log-only) hasn't
// been confirmed - if entitled BTECH accounts unexpectedly get bounced,
// check that first, the same way CLOUDFLARE.md's `/no-access` runbook
// says to check ROSTER_SERVICE_KEY/roster-service health before assuming
// a real data gap.
export async function checkRosterEntitlement(env: Env, email: string): Promise<boolean> {
  const response = await fetch(`${env.ROSTER_API_URL}/api/entitlement/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ROSTER_SERVICE_KEY}`,
    },
    body: JSON.stringify({ email, product: "kavita" }),
  });
  if (!response.ok) {
    // Distinguishes a roster-service/auth failure (bad ROSTER_SERVICE_KEY,
    // outage, etc.) from a genuine "not entitled" - both used to collapse
    // into the same silent `false`, making a token problem indistinguishable
    // from a real lockout when reading `wrangler tail` output.
    console.error(`checkRosterEntitlement: roster API returned ${response.status} for entitlement check`);
    return false;
  }
  const data = await response.json<{ entitled?: boolean }>().catch(() => ({ entitled: false }));
  return data.entitled === true;
}

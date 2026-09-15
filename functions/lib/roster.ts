// Shared by every login path that creates a Reader session (Access OTP,
// Google, Microsoft) - extracted out of api/auth/access.ts so the
// OAuth callbacks can't forget to call it. Reader's entitlement rule,
// per ad_labs/docs/unified-identity-v2-draft.md's resolution: implied by
// any active enrollment in any course, anywhere - not a per-course grant.
export async function checkRosterEntitlement(env: Env, email: string): Promise<boolean> {
  const response = await fetch(`${env.ROSTER_API_URL}/api/entitlement/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ROSTER_SERVICE_KEY}`,
    },
    body: JSON.stringify({ email, product: "reader" }),
  });
  if (!response.ok) {
    // Distinguishes a roster-service/auth failure (bad ROSTER_SERVICE_KEY,
    // outage, etc.) from a genuine "not entitled" - both used to collapse
    // into the same silent `false`, making a token problem indistinguishable
    // from a real lockout in `wrangler pages deployment tail`.
    console.error(`checkRosterEntitlement: roster API returned ${response.status} for entitlement check`);
    return false;
  }
  const data = await response.json<{ entitled?: boolean }>().catch(() => ({ entitled: false }));
  return data.entitled === true;
}

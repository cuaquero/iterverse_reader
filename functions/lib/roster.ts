// Shared by every login path that creates a Reader session (Access OTP,
// Google, Microsoft, LTI) - extracted out of api/auth/access.ts so the
// OAuth/LTI callbacks can't forget to call it. Reader's entitlement rule,
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
  if (!response.ok) return false;
  const data = await response.json<{ entitled?: boolean }>().catch(() => ({ entitled: false }));
  return data.entitled === true;
}

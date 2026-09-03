export interface OAuthIdentity {
  email: string;
  name: string | null;
  provider: "google" | "microsoft" | "lti" | "access";
  sub: string;
}

export interface UpsertedUser {
  id: string;
  role: "student" | "admin";
}

// Upsert-by-(provider, sub) first, matching a returning user by their stable
// provider subject id rather than email alone where possible (emails can
// theoretically be reassigned; the subject id can't).
//
// With LTI (and now Iterverse platform auth) in the mix, though, the same
// person legitimately signs in through more than one provider (Canvas,
// Cloudflare Access's OTP, Microsoft 365 once BTECH provisions student
// accounts), and email is the only claim they all share -- so a second
// provider match falls back to linking the existing account by email
// rather than colliding with the UNIQUE(email) constraint. This trades a
// little of the reassigned-email safety above for one account per person
// across login methods, which is the tradeoff BTECH asked for.
//
// "access" identities have no subject id distinct from the email itself
// (Access's OTP flow only ever proves "this address," nothing else), so
// their oauth_sub is just their own email -- the (provider, sub) match
// above still works, it just degenerates to matching by email directly
// for this one provider.
export async function upsertUser(db: D1Database, identity: OAuthIdentity): Promise<UpsertedUser> {
  const byProvider = await db
    .prepare("SELECT id, role FROM users WHERE oauth_provider = ? AND oauth_sub = ?")
    .bind(identity.provider, identity.sub)
    .first<{ id: string; role: "student" | "admin" }>();

  if (byProvider) {
    await db
      .prepare(
        "UPDATE users SET email = ?, name = ?, last_login_at = datetime('now') WHERE id = ?"
      )
      .bind(identity.email, identity.name, byProvider.id)
      .run();
    return byProvider;
  }

  const byEmail = await db
    .prepare("SELECT id, role FROM users WHERE email = ?")
    .bind(identity.email)
    .first<{ id: string; role: "student" | "admin" }>();

  if (byEmail) {
    await db
      .prepare(
        "UPDATE users SET oauth_provider = ?, oauth_sub = ?, name = ?, last_login_at = datetime('now') WHERE id = ?"
      )
      .bind(identity.provider, identity.sub, identity.name, byEmail.id)
      .run();
    return byEmail;
  }

  const id = crypto.randomUUID();
  // New accounts default to 'student' (the users table's column default);
  // promotion to 'admin' is a manual step for now (direct D1 update) until
  // the admin-management UI described in the BTECH role-gating note exists.
  await db
    .prepare(
      `INSERT INTO users (id, email, name, oauth_provider, oauth_sub, last_login_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(id, identity.email, identity.name, identity.provider, identity.sub)
    .run();
  return { id, role: "student" };
}

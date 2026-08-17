export interface OAuthIdentity {
  email: string;
  name: string | null;
  provider: "google" | "microsoft";
  sub: string;
}

export interface UpsertedUser {
  id: string;
  role: "student" | "admin";
}

// Upsert-by-(provider, sub), matching a returning user by their stable provider
// subject id rather than email alone (emails can theoretically be reassigned;
// the subject id can't).
export async function upsertUser(db: D1Database, identity: OAuthIdentity): Promise<UpsertedUser> {
  const existing = await db
    .prepare("SELECT id, role FROM users WHERE oauth_provider = ? AND oauth_sub = ?")
    .bind(identity.provider, identity.sub)
    .first<{ id: string; role: "student" | "admin" }>();

  if (existing) {
    await db
      .prepare(
        "UPDATE users SET email = ?, name = ?, last_login_at = datetime('now') WHERE id = ?"
      )
      .bind(identity.email, identity.name, existing.id)
      .run();
    return existing;
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

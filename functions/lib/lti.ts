// Helpers for LTI 1.3 platform registration lookup and launch verification.
//
// Unlike the Google/Microsoft flows (functions/lib/oauth.ts), an LTI id_token
// arrives over a browser redirect from the platform (Canvas), not a direct
// server-to-server exchange authenticated with our own client secret -- so it
// cannot be trusted just because we received it. It has to be signature-
// verified against the platform's own published JWKS before any claim is read.
//
// Login state (the OIDC `state`/`nonce` pair) is also handled differently
// than functions/lib/oauth.ts: that flow verifies `state` against a cookie,
// but an LTI login round-trip happens inside a Canvas-embedded iframe, where
// a cookie we set is a third-party cookie and unreliable under Safari ITP /
// Chrome's third-party-cookie phase-out. So state+nonce are stored server side
// in KV, keyed by the state value itself, and consumed (deleted) on first use.

export interface LtiPlatform {
  id: string;
  issuer: string;
  clientId: string;
  deploymentId: string | null;
  authLoginUrl: string;
  authTokenUrl: string;
  jwksUrl: string;
}

export interface LtiLoginState {
  nonce: string;
  issuer: string;
  clientId: string;
  targetLinkUri: string;
}

export interface LtiLaunchClaims {
  sub: string;
  email: string;
  name: string | null;
  roles: string[];
  deploymentId: string | null;
  contextId: string | null;
  contextTitle: string | null;
}

const LTI_LOGIN_STATE_TTL_SECONDS = 600; // 10 minutes to complete the platform round trip
const LTI_HANDOFF_TTL_SECONDS = 60; // just long enough for the bridge page to load and call /api/lti/exchange
const JWKS_CACHE_TTL_SECONDS = 3600; // Canvas rotates signing keys rarely; avoid a fetch on every launch

const LTI_MESSAGE_TYPE_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/message_type";
const LTI_DEPLOYMENT_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/deployment_id";
const LTI_ROLES_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/roles";
const LTI_CONTEXT_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/context";

export function newLtiState(): string {
  return crypto.randomUUID();
}

export function newLtiNonce(): string {
  return crypto.randomUUID();
}

export async function storeLtiLoginState(
  env: Env,
  state: string,
  data: LtiLoginState
): Promise<void> {
  await env.SESSIONS.put(`lti_state:${state}`, JSON.stringify(data), {
    expirationTtl: LTI_LOGIN_STATE_TTL_SECONDS,
  });
}

// Single-use: a captured `state` param can't be replayed against the login
// round trip a second time.
export async function consumeLtiLoginState(
  env: Env,
  state: string
): Promise<LtiLoginState | null> {
  const key = `lti_state:${state}`;
  const raw = await env.SESSIONS.get(key);
  if (!raw) return null;
  await env.SESSIONS.delete(key);
  try {
    return JSON.parse(raw) as LtiLoginState;
  } catch {
    return null;
  }
}

export async function getLtiPlatform(
  db: D1Database,
  issuer: string,
  clientId?: string | null
): Promise<LtiPlatform | null> {
  const row = clientId
    ? await db
        .prepare("SELECT * FROM lti_platforms WHERE issuer = ? AND client_id = ?")
        .bind(issuer, clientId)
        .first<any>()
    : await db
        .prepare(
          "SELECT * FROM lti_platforms WHERE issuer = ? ORDER BY created_at DESC LIMIT 1"
        )
        .bind(issuer)
        .first<any>();
  if (!row) return null;
  return {
    id: row.id,
    issuer: row.issuer,
    clientId: row.client_id,
    deploymentId: row.deployment_id,
    authLoginUrl: row.auth_login_url,
    authTokenUrl: row.auth_token_url,
    jwksUrl: row.jwks_url,
  };
}

// A single client_id/issuer registration can technically cover more than one
// Canvas deployment (e.g. a multi-campus instance sharing one Developer Key),
// so accepting any launch that matches the registration alone is broader than
// intended. Pin the platform to the deployment_id of its first launch, then
// reject any later launch whose deployment_id claim doesn't match.
export async function checkOrPinDeployment(
  db: D1Database,
  platform: LtiPlatform,
  claimDeploymentId: string | null
): Promise<boolean> {
  if (!claimDeploymentId) return false;
  if (!platform.deploymentId) {
    await db
      .prepare("UPDATE lti_platforms SET deployment_id = ? WHERE id = ?")
      .bind(claimDeploymentId, platform.id)
      .run();
    return true;
  }
  return platform.deploymentId === claimDeploymentId;
}

async function getPlatformJwks(env: Env, jwksUrl: string): Promise<any[]> {
  const cacheKey = `lti_jwks:${jwksUrl}`;
  const cached = await env.SESSIONS.get(cacheKey);
  if (cached) return JSON.parse(cached).keys;

  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error(`Failed to fetch platform JWKS (${res.status})`);
  const jwks = (await res.json()) as { keys: any[] };
  await env.SESSIONS.put(cacheKey, JSON.stringify(jwks), {
    expirationTtl: JWKS_CACHE_TTL_SECONDS,
  });
  return jwks.keys;
}

function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Verifies signature, issuer, audience, expiry and nonce, then returns the
// launch claims the rest of the app cares about. Throws a message that's safe
// to show the user (never echoes raw token contents) on any failure.
export async function verifyLtiLaunch(
  env: Env,
  idToken: string,
  platform: LtiPlatform,
  expectedNonce: string
): Promise<LtiLaunchClaims> {
  const [headerB64, payloadB64, signatureB64] = idToken.split(".");
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error("Malformed id_token");
  }

  const header = JSON.parse(
    new TextDecoder().decode(base64urlToUint8Array(headerB64))
  );
  const payload = JSON.parse(
    new TextDecoder().decode(base64urlToUint8Array(payloadB64))
  );

  const keys = await getPlatformJwks(env, platform.jwksUrl);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("No matching key in platform JWKS");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlToUint8Array(signatureB64);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signature as BufferSource,
    signedData as BufferSource
  );
  if (!valid) throw new Error("id_token signature verification failed");

  if (payload.iss !== platform.issuer) throw new Error("Unexpected issuer");
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(platform.clientId)) throw new Error("Unexpected audience");
  if (payload.nonce !== expectedNonce) throw new Error("Nonce mismatch");
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
    throw new Error("id_token expired");
  }
  if (payload[LTI_MESSAGE_TYPE_CLAIM] !== "LtiResourceLinkRequest") {
    throw new Error("Unsupported LTI message type");
  }
  if (!payload.email) {
    throw new Error("Canvas did not release an email claim for this launch");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    roles: Array.isArray(payload[LTI_ROLES_CLAIM]) ? payload[LTI_ROLES_CLAIM] : [],
    deploymentId: payload[LTI_DEPLOYMENT_CLAIM] ?? null,
    contextId: payload[LTI_CONTEXT_CLAIM]?.id ?? null,
    contextTitle: payload[LTI_CONTEXT_CLAIM]?.title ?? null,
  };
}

// One-time code handed to the browser in a URL fragment (see
// functions/api/lti/launch.ts) so the /lti/bridge page can pick up the
// already-created session without relying on a third-party cookie.
export async function createLtiHandoff(env: Env, sessionId: string): Promise<string> {
  const code = crypto.randomUUID();
  await env.SESSIONS.put(`lti_handoff:${code}`, sessionId, {
    expirationTtl: LTI_HANDOFF_TTL_SECONDS,
  });
  return code;
}

export async function consumeLtiHandoff(env: Env, code: string): Promise<string | null> {
  const key = `lti_handoff:${code}`;
  const sessionId = await env.SESSIONS.get(key);
  if (!sessionId) return null;
  await env.SESSIONS.delete(key);
  return sessionId;
}

import { appBaseUrl } from "../../lib/session";

// LTI 1.3 Dynamic Registration (https://www.imsglobal.org/spec/lti-dr/v1p0/).
// A Canvas admin opens this URL from Developer Keys > LTI Registration;
// Canvas appends `openid_configuration` (its own OIDC discovery document) and
// a one-time `registration_token`. We fetch that document, POST our own tool
// description back to Canvas's registration_endpoint using the token as
// bearer auth, and store the resulting client_id/endpoints so
// /api/lti/login and /api/lti/launch can find this platform by issuer.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const openIdConfigUrl = url.searchParams.get("openid_configuration");
  const registrationToken = url.searchParams.get("registration_token");

  if (!openIdConfigUrl) {
    return new Response("Missing openid_configuration parameter.", { status: 400 });
  }

  const configRes = await fetch(openIdConfigUrl);
  if (!configRes.ok) {
    return new Response(
      `Failed to fetch the platform's configuration (${configRes.status}).`,
      { status: 502 }
    );
  }
  const config = (await configRes.json()) as {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
    registration_endpoint: string;
  };

  const base = appBaseUrl(ctx.request, ctx.env);
  const toolRegistration = {
    application_type: "web",
    response_types: ["id_token"],
    grant_types: ["implicit", "client_credentials"],
    initiate_login_uri: `${base}/api/lti/login`,
    redirect_uris: [`${base}/api/lti/launch`],
    client_name: "BTECH Reader",
    jwks_uri: `${base}/api/lti/jwks`,
    token_endpoint_auth_method: "private_key_jwt",
    scope: "openid",
    "https://purl.imsglobal.org/spec/lti-tool-configuration": {
      domain: new URL(base).hostname,
      target_link_uri: `${base}/manager/home`,
      claims: ["iss", "sub", "email", "name"],
      messages: [
        {
          type: "LtiResourceLinkRequest",
          target_link_uri: `${base}/manager/home`,
        },
      ],
    },
  };

  const registerRes = await fetch(config.registration_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${registrationToken}`,
    },
    body: JSON.stringify(toolRegistration),
  });

  if (!registerRes.ok) {
    return new Response(
      `Registration with the platform failed (${registerRes.status}).`,
      { status: 502 }
    );
  }

  const registered = (await registerRes.json()) as { client_id: string };

  await ctx.env.DB.prepare(
    `INSERT INTO lti_platforms (id, issuer, client_id, auth_login_url, auth_token_url, jwks_url)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(issuer, client_id) DO UPDATE SET
       auth_login_url = excluded.auth_login_url,
       auth_token_url = excluded.auth_token_url,
       jwks_url = excluded.jwks_url`
  )
    .bind(
      crypto.randomUUID(),
      config.issuer,
      registered.client_id,
      config.authorization_endpoint,
      config.token_endpoint,
      config.jwks_uri
    )
    .run();

  // Spec-required completion page: tells the window Canvas opened for this
  // flow to close itself once registration succeeds.
  const html = `<!doctype html>
<html>
<body>
<script>
  (window.opener || window.parent).postMessage(
    { subject: "org.imsglobal.lti.close" },
    "*"
  );
</script>
<p>Registration complete. You can close this window.</p>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
};

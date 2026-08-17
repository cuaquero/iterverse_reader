// Publishes this tool's own public key. Required by the LTI Dynamic
// Registration spec (functions/api/lti/register.ts advertises this URL as its
// jwks_uri) even though plain login/launch never consumes it -- it only
// matters later if grade passback / roster sync (LTI Advantage services) are
// added, since those use the matching private key to sign the tool's own
// service-call assertions.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.LTI_TOOL_PUBLIC_JWK) {
    return new Response("LTI tool keys aren't configured yet.", { status: 501 });
  }

  const jwk = JSON.parse(ctx.env.LTI_TOOL_PUBLIC_JWK);
  return new Response(JSON.stringify({ keys: [jwk] }), {
    headers: { "Content-Type": "application/json" },
  });
};

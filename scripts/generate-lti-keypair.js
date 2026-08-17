#!/usr/bin/env node
// Generates the RS256 keypair this tool needs for LTI Dynamic Registration's
// jwks_uri (functions/api/lti/jwks.ts) -- see LTI.md's "Tool keypair" section
// for why. Run once; the private key isn't consumed by any code yet (it's a
// placeholder for future grade passback / roster sync), but the public JWK
// is required for /api/lti/jwks to respond, which registration checks.
//
// Usage: node scripts/generate-lti-keypair.js
const crypto = require("crypto");

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const publicJwk = publicKey.export({ format: "jwk" });
publicJwk.kid = crypto.randomUUID();
publicJwk.alg = "RS256";
publicJwk.use = "sig";

const privatePem = privateKey.export({ format: "pem", type: "pkcs8" });

console.log("=== LTI_TOOL_PRIVATE_KEY (PKCS8 PEM -- keep this secret) ===\n");
console.log(privatePem);

console.log("=== LTI_TOOL_PUBLIC_JWK (published at /api/lti/jwks) ===\n");
console.log(JSON.stringify(publicJwk));

console.log("\nSet both with:\n");
console.log(
  "  npx wrangler pages secret put LTI_TOOL_PRIVATE_KEY --project-name=btech-books"
);
console.log(
  "  npx wrangler pages secret put LTI_TOOL_PUBLIC_JWK --project-name=btech-books"
);

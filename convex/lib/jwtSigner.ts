// Mint RS256 JWTs that this deployment will accept.
//
// Used by the refresh grant to issue fresh access tokens without a full
// re-authorization. Uses JWT_PRIVATE_KEY (PKCS8 PEM) — the same key
// `npx @convex-dev/auth` generates and whose public half is in JWKS,
// so tokens signed here verify identically to those Convex Auth issues.

const EXPECTED_AUDIENCE = "convex";

function base64UrlEncodeString(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const stripped = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(stripped);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function loadSigningKey(): Promise<CryptoKey> {
  const pem = process.env.JWT_PRIVATE_KEY;
  if (!pem) {
    throw new Error(
      "JWT_PRIVATE_KEY environment variable is not set. Run `npx @convex-dev/auth` to generate signing keys.",
    );
  }
  const der = pemToDer(pem);
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function issuer(): string {
  const url = process.env.CONVEX_SITE_URL;
  if (!url) throw new Error("CONVEX_SITE_URL environment variable is not set");
  return url;
}

export interface MintOptions {
  sub: string;
  ttlSeconds?: number;
}

/**
 * Mint a new RS256 JWT with the given `sub`. Claims mirror Convex Auth:
 * `iss` = deployment site URL, `aud` = "convex", `iat`/`exp` are now-based.
 * Default TTL is 1 hour to match Convex Auth's own access-token lifetime.
 */
export async function mintAccessToken(opts: MintOptions): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    sub: opts.sub,
    iat: now,
    exp: now + (opts.ttlSeconds ?? 3600),
    iss: issuer(),
    aud: EXPECTED_AUDIENCE,
  };

  const headerB64 = base64UrlEncodeString(JSON.stringify(header));
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await loadSigningKey();
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(sig))}`;
}

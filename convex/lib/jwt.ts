import { decodeJwtPayload, validateJwtClaims } from "./tokenAuth";

// Full cryptographic verification of Convex Auth access tokens.
//
// Tokens are RS256 JWTs signed with the deployment's JWT_PRIVATE_KEY. The
// matching public key set lives in the JWKS environment variable (both are
// created by `npx @convex-dev/auth`), so verification needs no network call.
//
// This runs in HTTP actions (convex/http.ts), which are the only public
// entry point to the CRM: all business-logic functions are internal-only,
// so a token that fails verification here can never reach them.

interface JwtHeader {
  alg?: string;
  kid?: string;
}

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const base64 =
    input.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (input.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJwtHeader(token: string): JwtHeader | null {
  try {
    const headerPart = token.split(".")[0];
    const decoded = new TextDecoder().decode(base64UrlToBytes(headerPart));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function loadJwks(): JsonWebKey[] {
  const jwksJson = process.env.JWKS;
  if (!jwksJson) {
    throw new Error(
      "JWKS environment variable is not set. Run `npx @convex-dev/auth` to generate the signing keys."
    );
  }
  const parsed = JSON.parse(jwksJson) as { keys?: JsonWebKey[] };
  if (!parsed.keys || parsed.keys.length === 0) {
    throw new Error("JWKS environment variable contains no keys");
  }
  return parsed.keys;
}

export interface VerifiedClaims {
  sub?: string;
  email?: string;
}

/**
 * Verify an access token's signature (RS256 against the deployment JWKS)
 * and claims (expiration, issuer, audience).
 *
 * Returns the verified claims, or null if the token is invalid or expired.
 * Throws only on server misconfiguration (missing/broken JWKS).
 */
export async function verifyAccessToken(
  token: string
): Promise<VerifiedClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const header = decodeJwtHeader(token);
  if (!header || header.alg !== "RS256") return null;

  const keys = loadJwks();
  // Prefer the key matching the token's kid; fall back to trying all keys
  // (Convex Auth JWKS typically contains a single unlabeled key).
  const withKid = header.kid
    ? keys.filter((k) => (k as { kid?: string }).kid === header.kid)
    : [];
  const candidates = withKid.length > 0 ? withKid : keys;

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = base64UrlToBytes(parts[2]);
  } catch {
    return null;
  }

  let signatureValid = false;
  for (const jwk of candidates) {
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      );
      if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data)) {
        signatureValid = true;
        break;
      }
    } catch {
      // Key not importable or wrong type - try the next one
      continue;
    }
  }
  if (!signatureValid) return null;

  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const validation = validateJwtClaims(payload);
  if (!validation.valid) return null;

  return {
    sub: payload.sub as string | undefined,
    email: payload.email as string | undefined,
  };
}

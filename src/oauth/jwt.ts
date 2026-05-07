import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export interface AccessTokenClaims {
  sub: string;           // api_key_id
  aud: string;           // resource URL (e.g. https://www.tradesapi.com/mcp)
  iss: string;           // issuer (e.g. https://www.tradesapi.com)
  email: string;
  scope: string;         // space-separated scopes (e.g. "mcp:tools")
  clientId: string;      // OAuth client_id
}

function getSigningKeys(): Uint8Array[] {
  const raw = process.env.JWT_SECRET ?? "";
  if (!raw) throw new Error("JWT_SECRET is not configured");
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new TextEncoder().encode(s));
}

/** Sign with the FIRST key in the rotation list (primary signing key). */
export async function signAccessToken(
  claims: AccessTokenClaims,
  ttlSeconds: number,
): Promise<string> {
  const keys = getSigningKeys();
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    email: claims.email,
    scope: claims.scope,
    client_id: claims.clientId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(claims.iss)
    .setAudience(claims.aud)
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .setJti(randomUUID())
    .sign(keys[0]);
}

/**
 * Verify a JWT against all keys in the rotation list. Returns AuthInfo on success.
 * Throws if signature, audience, expiry, or issuer are invalid under every key.
 *
 * @param expectedIssuer  Optional. When provided, the `iss` claim must match exactly.
 *                        Pass the configured ISSUER constant from OAuthServerProvider;
 *                        omit in contexts where issuer validation is not required.
 */
export async function verifyAccessToken(
  token: string,
  expectedAudience: string,
  expectedIssuer?: string,
): Promise<AuthInfo> {
  const keys = getSigningKeys();
  let lastErr: unknown = null;
  for (const key of keys) {
    try {
      const { payload } = await jwtVerify(token, key, {
        audience: expectedAudience,
        algorithms: ["HS256"],
        ...(expectedIssuer ? { issuer: expectedIssuer } : {}),
      });
      const scope = (payload.scope as string | undefined) ?? "";
      return {
        token,
        clientId: payload.client_id as string,
        scopes: scope.split(" ").filter(Boolean),
        expiresAt: payload.exp,
        resource: new URL(expectedAudience),
        extra: {
          sub: payload.sub as string,
          email: payload.email as string,
          jti: payload.jti,
        },
      };
    } catch (err) {
      lastErr = err;
    }
  }
  // Normalize the error: jose's JWTExpired/JWTClaimValidationFailed embed the
  // decoded payload on the error object. Re-throwing them directly risks
  // leaking claim bytes into response bodies or logs. We wrap with a stable
  // message and preserve the original via `cause` for local debugging only.
  throw new Error("token verification failed", { cause: lastErr ?? undefined });
}

/**
 * Heuristic: is this string shaped like a JWT?
 * Used to distinguish OAuth JWTs from raw API keys on the Authorization header.
 * Three base64url-ish segments separated by dots.
 */
export function looksLikeJwt(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  // Header must decode to JSON with "alg"
  try {
    const header = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    );
    return typeof header?.alg === "string";
  } catch {
    return false;
  }
}

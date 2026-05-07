import { randomBytes, createHash } from "node:crypto";
import type { Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InvalidGrantError,
  ServerError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";

import { getRedis, getdel } from "../redis.js";
import { signAccessToken, verifyAccessToken } from "./jwt.js";
import { getUserRemote } from "./internal-api.js";
import { ClientsStore } from "./store.js";

const ACCESS_TOKEN_TTL = 3600;
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30;
const AUTH_CODE_TTL = 600;
const OAUTH_REF_TTL = 600;

const ISSUER = process.env.OAUTH_ISSUER ?? "https://www.tradesapi.com";
const RESOURCE = process.env.OAUTH_RESOURCE ?? "https://www.tradesapi.com/mcp";
const LOGIN_URL = process.env.OAUTH_LOGIN_URL ?? "/auth/login";

interface PendingAuthorizeParams {
  client_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: "S256";
  state?: string;
  resource?: string;
}

interface StoredCode extends PendingAuthorizeParams {
  api_key_id: string;
}

interface RefreshRecord {
  api_key_id: string;
  client_id: string;
  scope: string;
  family_id: string;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function randHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

async function revokeFamily(familyId: string): Promise<void> {
  const r = getRedis();

  // Dedup: if this family was just revoked, skip the SCAN. The dedup key has
  // its own TTL and lets repeat-replay attempts return cheaply (the consumed
  // ledger detection still fires, we just skip the redundant scan + delete).
  const dedupKey = `oauth_family_revoked:${familyId}`;
  const recent = await r.set(dedupKey, "1", "EX", 60, "NX");
  if (recent !== "OK") return; // Another caller (or recent caller) already swept

  const pattern = `oauth_refresh:*`;
  const stream = r.scanStream({ match: pattern, count: 100 });
  const toDelete: string[] = [];
  for await (const keys of stream) {
    for (const key of keys as string[]) {
      const raw = await r.get(key);
      if (!raw) continue;
      try {
        const data = JSON.parse(raw) as RefreshRecord;
        if (data.family_id === familyId) toDelete.push(key);
      } catch {
        // Fix I2: skip malformed rows so one bad value doesn't tank revocation
      }
    }
  }
  if (toDelete.length) await r.del(...toDelete);
}

export class OAuthProvider implements OAuthServerProvider {
  private _clientsStore = new ClientsStore();

  get clientsStore() {
    return this._clientsStore;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const r = getRedis();
    const sessionId = (res.req as any).cookies?.session_id as string | undefined;
    let session: { api_key_id: string; email: string } | null = null;

    if (sessionId) {
      const raw = await r.get(`session:${sessionId}`);
      if (raw) {
        try {
          session = JSON.parse(raw);
        } catch { /* ignore */ }
      }
    }

    const pending: PendingAuthorizeParams = {
      client_id: client.client_id,
      redirect_uri: params.redirectUri,
      scope: (params.scopes ?? []).join(" ") || "mcp:tools",
      code_challenge: params.codeChallenge,
      code_challenge_method: "S256",
      state: params.state,
      resource: params.resource?.toString(),
    };

    if (!session) {
      const oauthRef = randHex(24);
      await r.setex(`oauth_ref:${oauthRef}`, OAUTH_REF_TTL, JSON.stringify(pending));
      const loginUrl = `${LOGIN_URL}?oauth_ref=${encodeURIComponent(oauthRef)}`;
      res.redirect(302, loginUrl);
      return;
    }

    const consentToken = randHex(24);
    await r.setex(
      `oauth_consent:${consentToken}`,
      OAUTH_REF_TTL,
      JSON.stringify({ ...pending, api_key_id: session.api_key_id }),
    );
    const { renderConsent } = await import("./consent.js");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(
      renderConsent({
        client,
        scope: pending.scope,
        consentToken,
        userEmail: session.email,
        redirectUri: pending.redirect_uri,
      }),
    );
  }

  async issueCodeFromConsent(consentToken: string): Promise<{
    redirect: string;
  }> {
    const raw = await getdel(`oauth_consent:${consentToken}`);
    if (!raw) throw new InvalidGrantError("invalid or expired consent token");
    const pending = JSON.parse(raw) as StoredCode;

    const code = randHex(24);
    await getRedis().setex(
      `oauth_code:${code}`,
      AUTH_CODE_TTL,
      JSON.stringify(pending),
    );

    const url = new URL(pending.redirect_uri);
    url.searchParams.set("code", code);
    if (pending.state) url.searchParams.set("state", pending.state);
    return { redirect: url.toString() };
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const raw = await getRedis().get(`oauth_code:${authorizationCode}`);
    if (!raw) throw new InvalidGrantError("invalid or expired authorization code");
    const data = JSON.parse(raw) as StoredCode;
    return data.code_challenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier: string | undefined,
    redirectUri: string | undefined,
    resource: URL | undefined,
  ): Promise<OAuthTokens> {
    const raw = await getdel(`oauth_code:${authorizationCode}`);
    if (!raw) throw new InvalidGrantError("invalid or expired authorization code");
    const data = JSON.parse(raw) as StoredCode;

    if (data.client_id !== client.client_id) {
      throw new InvalidGrantError("client_id mismatch");
    }
    // RFC 6749 §4.1.3 + RFC 8707 §2: if a value was bound to the auth code
    // at /authorize, it MUST be presented at /token and MUST match. Previously
    // the check fired only when the caller PRESENTED the value — letting a
    // client omit it at /token to bypass binding. Fail closed instead.
    if (data.redirect_uri) {
      if (!redirectUri || data.redirect_uri !== redirectUri) {
        throw new InvalidGrantError("redirect_uri must match the authorization request");
      }
    }
    if (data.resource) {
      if (!resource || data.resource !== resource.toString()) {
        throw new InvalidGrantError("resource must match the authorization request");
      }
    }

    return await this._mintPair({
      apiKeyId: data.api_key_id,
      clientId: client.client_id,
      scope: data.scope,
      familyId: randHex(16),
    });
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes: string[] | undefined,
    _resource: URL | undefined,
  ): Promise<OAuthTokens> {
    // RFC 8707 §2.2 says the AS SHOULD validate the resource parameter on
    // refresh requests. We deploy a single resource server (RESOURCE constant
    // above, immutable at mint time), so the resource bound to the refresh
    // token is always the same as the one the client can request. Validation
    // is moot today. When/if we add multi-tenant resources, reject
    // _resource && _resource.toString() !== <expected> here.
    const hash = sha256(refreshToken);
    const raw = await getdel(`oauth_refresh:${hash}`);

    if (!raw) {
      const consumed = await getRedis().get(`oauth_refresh_consumed:${hash}`);
      if (consumed) {
        await revokeFamily(consumed);
        throw new InvalidGrantError("refresh token replay detected");
      }
      throw new InvalidGrantError("invalid or expired refresh token");
    }

    const record = JSON.parse(raw) as RefreshRecord;
    if (record.client_id !== client.client_id) {
      await revokeFamily(record.family_id);
      throw new InvalidGrantError("client_id mismatch on refresh");
    }

    // Write the consumed-ledger entry BEFORE _mintPair so that a replay
    // arriving during _mintPair's HTTP roundtrip is detected. Trade-off:
    // a transient _mintPair failure leaves R1 consumed, so the user's
    // retry will trigger family revocation. Acceptable vs. the race window.
    await getRedis().setex(
      `oauth_refresh_consumed:${hash}`,
      REFRESH_TOKEN_TTL,
      record.family_id,
    );

    const pair = await this._mintPair({
      apiKeyId: record.api_key_id,
      clientId: client.client_id,
      scope: record.scope,
      familyId: record.family_id,
    });

    return pair;
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    return await verifyAccessToken(token, RESOURCE, ISSUER);
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const hint = request.token_type_hint;
    if (hint === "access_token") {
      return;
    }
    await getRedis().del(`oauth_refresh:${sha256(request.token)}`);
  }

  private async _mintPair(args: {
    apiKeyId: string;
    clientId: string;
    scope: string;
    familyId: string;
  }): Promise<OAuthTokens> {
    const user = await getUserRemote(args.apiKeyId);
    // The api_key_id was bound at consent time — if the user was deleted
    // between then and now, we can't mint. This is server-side state, so
    // ServerError (500 server_error) is the correct shape, not invalid_grant.
    if (!user) throw new ServerError("user lookup failed for api_key_id");

    const accessToken = await signAccessToken(
      {
        sub: args.apiKeyId,
        aud: RESOURCE,
        iss: ISSUER,
        email: user.email,
        scope: args.scope,
        clientId: args.clientId,
      },
      ACCESS_TOKEN_TTL,
    );
    const refreshToken = randHex(32);
    const record: RefreshRecord = {
      api_key_id: args.apiKeyId,
      client_id: args.clientId,
      scope: args.scope,
      family_id: args.familyId,
    };
    await getRedis().setex(
      `oauth_refresh:${sha256(refreshToken)}`,
      REFRESH_TOKEN_TTL,
      JSON.stringify(record),
    );

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL,
      refresh_token: refreshToken,
      scope: args.scope,
    };
  }
}

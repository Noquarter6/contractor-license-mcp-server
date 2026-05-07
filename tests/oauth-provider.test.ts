import { describe, it, expect, vi, beforeEach } from "vitest";
import { OAuthProvider } from "../src/oauth/provider.js";
import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

vi.mock("../src/redis.js", () => {
  const store = new Map<string, string>();
  return {
    getRedis: () => ({
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string, mode?: string, _ex?: string | number, nx?: string) => {
        if (mode === "EX" && nx === "NX") {
          // Atomic SET if not exists
          if (store.has(k)) return null;
          store.set(k, v);
          return "OK";
        }
        store.set(k, v);
        return "OK";
      },
      setex: async (k: string, _ttl: number, v: string) => {
        store.set(k, v);
        return "OK";
      },
      del: async (...keys: string[]) => {
        let n = 0;
        for (const k of keys) if (store.delete(k)) n++;
        return n;
      },
      // ── DEVIATION FROM PLAN: add scanStream so revokeFamily() works in tests ──
      // Without this, the replay detection test fails with "r.scanStream is not a function"
      // because revokeFamily() iterates all oauth_refresh:* keys to find family members.
      scanStream: ({ match }: { match: string; count?: number }) => {
        // Match supports trailing wildcard like "oauth_refresh:*"
        const prefix = match.replace(/\*$/, "");
        const keys = Array.from(store.keys()).filter((k) => k.startsWith(prefix));
        // Return an async iterable that yields one batch of keys
        return {
          async *[Symbol.asyncIterator]() {
            yield keys;
          },
        };
      },
    }),
    getdel: async (k: string) => {
      const v = store.get(k) ?? null;
      store.delete(k);
      return v;
    },
    __store: store,
  };
});

vi.mock("../src/oauth/internal-api.js", () => ({
  getUserRemote: vi.fn().mockResolvedValue({
    api_key_id: "key-123",
    email: "user@example.com",
  }),
}));

const SECRET = "a".repeat(32);

beforeEach(async () => {
  process.env.JWT_SECRET = SECRET;
  process.env.OAUTH_ISSUER = "https://www.tradesapi.com";
  process.env.OAUTH_RESOURCE = "https://www.tradesapi.com/mcp";
  // Clear the mocked redis store so dedup keys/scans don't leak between tests
  const mod = await import("../src/redis.js");
  (mod as any).__store?.clear?.();
});

describe("OAuthProvider", () => {
  it("exchangeAuthorizationCode issues JWT + refresh token pair", async () => {
    const { getRedis } = await import("../src/redis.js");
    const r = getRedis();
    // Seed a code in Redis
    await (r as any).setex(
      "oauth_code:test-code",
      600,
      JSON.stringify({
        client_id: "client-abc",
        redirect_uri: "http://localhost:9999/callback",
        code_challenge: "xyz",
        code_challenge_method: "S256",
        api_key_id: "key-123",
        scope: "mcp:tools",
        resource: "https://www.tradesapi.com/mcp",
      }),
    );

    const provider = new OAuthProvider();
    const client = { client_id: "client-abc", redirect_uris: ["http://localhost:9999/callback"] } as any;
    const tokens = await provider.exchangeAuthorizationCode(
      client,
      "test-code",
      undefined,
      "http://localhost:9999/callback",
      new URL("https://www.tradesapi.com/mcp"),
    );
    expect(tokens.access_token).toMatch(/^eyJ/);
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.expires_in).toBeGreaterThan(0);
  });

  it("exchangeRefreshToken rotates refresh token + keeps same family", async () => {
    const provider = new OAuthProvider();
    const client = { client_id: "client-abc" } as any;

    const { getRedis } = await import("../src/redis.js");
    const r = getRedis();
    await (r as any).setex(
      "oauth_code:bootstrap",
      600,
      JSON.stringify({
        client_id: "client-abc",
        redirect_uri: "http://localhost:9999/callback",
        code_challenge: "xyz",
        code_challenge_method: "S256",
        api_key_id: "key-123",
        scope: "mcp:tools",
        resource: "https://www.tradesapi.com/mcp",
      }),
    );
    const first = await provider.exchangeAuthorizationCode(
      client, "bootstrap", undefined, "http://localhost:9999/callback",
      new URL("https://www.tradesapi.com/mcp"),
    );

    const rotated = await provider.exchangeRefreshToken(
      client, first.refresh_token!, ["mcp:tools"],
      new URL("https://www.tradesapi.com/mcp"),
    );
    expect(rotated.refresh_token).toBeTruthy();
    expect(rotated.refresh_token).not.toBe(first.refresh_token);

    // Replaying the old (now-consumed) refresh token MUST fail and revoke the family
    await expect(
      provider.exchangeRefreshToken(
        client, first.refresh_token!, ["mcp:tools"],
        new URL("https://www.tradesapi.com/mcp"),
      ),
    ).rejects.toThrow();

    // And the freshly rotated token should also be revoked after replay detection
    await expect(
      provider.exchangeRefreshToken(
        client, rotated.refresh_token!, ["mcp:tools"],
        new URL("https://www.tradesapi.com/mcp"),
      ),
    ).rejects.toThrow();
  });

  it("challengeForAuthorizationCode returns the stored challenge", async () => {
    const { getRedis } = await import("../src/redis.js");
    const r = getRedis();
    await (r as any).setex(
      "oauth_code:with-challenge",
      600,
      JSON.stringify({
        client_id: "client-abc",
        redirect_uri: "http://localhost:9999/callback",
        code_challenge: "the-challenge",
        code_challenge_method: "S256",
        api_key_id: "key-123",
        scope: "mcp:tools",
      }),
    );
    const provider = new OAuthProvider();
    const challenge = await provider.challengeForAuthorizationCode(
      { client_id: "client-abc" } as any,
      "with-challenge",
    );
    expect(challenge).toBe("the-challenge");
  });

  it("exchangeRefreshToken with wrong client_id revokes the entire family", async () => {
    const provider = new OAuthProvider();
    const clientA = { client_id: "client-a" } as any;
    const clientB = { client_id: "client-b" } as any;

    // Bootstrap: issue a refresh token under client-a
    const { getRedis } = await import("../src/redis.js");
    const r = getRedis();
    await (r as any).setex(
      "oauth_code:client-id-mismatch-bootstrap",
      600,
      JSON.stringify({
        client_id: "client-a",
        redirect_uri: "http://localhost:9999/callback",
        code_challenge: "xyz",
        code_challenge_method: "S256",
        api_key_id: "key-123",
        scope: "mcp:tools",
        resource: "https://www.tradesapi.com/mcp",
      }),
    );
    const original = await provider.exchangeAuthorizationCode(
      clientA, "client-id-mismatch-bootstrap", undefined, "http://localhost:9999/callback",
      new URL("https://www.tradesapi.com/mcp"),
    );

    // Attacker (client-b) tries to use client-a's refresh token
    await expect(
      provider.exchangeRefreshToken(
        clientB, original.refresh_token!, ["mcp:tools"],
        new URL("https://www.tradesapi.com/mcp"),
      ),
    ).rejects.toThrow();

    // Legit client-a tries to refresh — family was revoked, must fail
    await expect(
      provider.exchangeRefreshToken(
        clientA, original.refresh_token!, ["mcp:tools"],
        new URL("https://www.tradesapi.com/mcp"),
      ),
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // A3 + A5: auth-code downgrade defense + InvalidGrantError migration
  // -------------------------------------------------------------------------

  it("exchangeAuthorizationCode rejects when stored redirect_uri is omitted at /token", async () => {
    const provider = new OAuthProvider();
    const client = { client_id: "client-abc" } as any;
    const { getRedis } = await import("../src/redis.js");
    const r = getRedis();
    await (r as any).setex(
      "oauth_code:redirect-downgrade",
      600,
      JSON.stringify({
        client_id: "client-abc",
        redirect_uri: "http://localhost:9999/callback",
        code_challenge: "xyz",
        code_challenge_method: "S256",
        api_key_id: "key-123",
        scope: "mcp:tools",
        resource: "https://www.tradesapi.com/mcp",
      }),
    );
    // Pass redirectUri=undefined even though the stored code has one.
    // Pre-fix this passed silently. Now it must throw InvalidGrantError.
    await expect(
      provider.exchangeAuthorizationCode(
        client, "redirect-downgrade", undefined,
        undefined, // <-- the downgrade
        new URL("https://www.tradesapi.com/mcp"),
      ),
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("exchangeAuthorizationCode rejects when stored resource is omitted at /token", async () => {
    const provider = new OAuthProvider();
    const client = { client_id: "client-abc" } as any;
    const { getRedis } = await import("../src/redis.js");
    const r = getRedis();
    await (r as any).setex(
      "oauth_code:resource-downgrade",
      600,
      JSON.stringify({
        client_id: "client-abc",
        redirect_uri: "http://localhost:9999/callback",
        code_challenge: "xyz",
        code_challenge_method: "S256",
        api_key_id: "key-123",
        scope: "mcp:tools",
        resource: "https://www.tradesapi.com/mcp",
      }),
    );
    await expect(
      provider.exchangeAuthorizationCode(
        client, "resource-downgrade", undefined,
        "http://localhost:9999/callback",
        undefined, // <-- the resource downgrade
      ),
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("exchangeAuthorizationCode throws InvalidGrantError on client_id mismatch", async () => {
    const provider = new OAuthProvider();
    const { getRedis } = await import("../src/redis.js");
    const r = getRedis();
    await (r as any).setex(
      "oauth_code:client-mismatch",
      600,
      JSON.stringify({
        client_id: "client-a",
        redirect_uri: "http://localhost:9999/callback",
        code_challenge: "xyz",
        code_challenge_method: "S256",
        api_key_id: "key-123",
        scope: "mcp:tools",
        resource: "https://www.tradesapi.com/mcp",
      }),
    );
    await expect(
      provider.exchangeAuthorizationCode(
        { client_id: "client-b" } as any,
        "client-mismatch",
        undefined,
        "http://localhost:9999/callback",
        new URL("https://www.tradesapi.com/mcp"),
      ),
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("exchangeAuthorizationCode throws InvalidGrantError on missing code", async () => {
    const provider = new OAuthProvider();
    await expect(
      provider.exchangeAuthorizationCode(
        { client_id: "x" } as any,
        "does-not-exist",
        undefined,
        "http://localhost:9999/callback",
        new URL("https://www.tradesapi.com/mcp"),
      ),
    ).rejects.toBeInstanceOf(InvalidGrantError);
  });

  it("revokeToken deletes the refresh key from Redis", async () => {
    const provider = new OAuthProvider();
    const client = { client_id: "client-abc" } as any;
    const { getRedis } = await import("../src/redis.js");
    const r = getRedis();
    await (r as any).setex(
      "oauth_code:rev",
      600,
      JSON.stringify({
        client_id: "client-abc",
        redirect_uri: "http://localhost:9999/callback",
        code_challenge: "xyz",
        code_challenge_method: "S256",
        api_key_id: "key-123",
        scope: "mcp:tools",
        resource: "https://www.tradesapi.com/mcp",
      }),
    );
    const tokens = await provider.exchangeAuthorizationCode(
      client, "rev", undefined, "http://localhost:9999/callback",
      new URL("https://www.tradesapi.com/mcp"),
    );
    await provider.revokeToken!(client, {
      token: tokens.refresh_token!,
      token_type_hint: "refresh_token",
    });
    await expect(
      provider.exchangeRefreshToken(
        client, tokens.refresh_token!, ["mcp:tools"],
        new URL("https://www.tradesapi.com/mcp"),
      ),
    ).rejects.toThrow();
  });
});

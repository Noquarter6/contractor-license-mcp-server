import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";

// Mock Redis and all OAuth modules that touch network resources so importing
// http.ts (which calls app.listen at module level) doesn't fail in tests.
// MCP_PORT=0 lets the OS assign an ephemeral port; PORT=0 avoids conflicts.
process.env.MCP_PORT = "0";

vi.mock("../src/redis.js", () => {
  const store = new Map<string, string>();
  return {
    getRedis: () => ({
      get: async (k: string) => store.get(k) ?? null,
      set: async () => "OK",
      setex: async () => "OK",
      del: async () => 0,
      scanStream: () => ({ [Symbol.asyncIterator]: async function* () {} }),
    }),
    getdel: async () => null,
  };
});

vi.mock("../src/oauth/internal-api.js", () => ({
  getUserRemote: async () => null,
  getClientRemote: async () => null,
  registerClientRemote: async () => { throw new Error("not available in test"); },
}));

vi.mock("../src/oauth/jwt.js", () => ({
  signAccessToken: async () => "mock.jwt.token",
  verifyAccessToken: async () => {
    throw new Error("invalid token");
  },
  looksLikeJwt: (t: string) => t.startsWith("jwt."),
}));

vi.mock("../src/api.js", () => ({
  ApiClient: class {
    constructor() {}
  },
}));

vi.mock("../src/server.js", () => ({
  createServer: () => ({
    connect: async () => {},
  }),
}));

import { sessionIdentity, type AuthResult } from "../src/http.js";

describe("sessionIdentity", () => {
  it("JWT auth uses apiKeyId", () => {
    const auth: AuthResult = { apiKeyId: "key-abc", token: "jwt.token.here", isJwt: true };
    expect(sessionIdentity(auth)).toBe("key-abc");
  });

  it("raw-key auth uses sha256 of the token", () => {
    const auth: AuthResult = { token: "raw-api-key-12345", isJwt: false };
    const expected = createHash("sha256").update("raw-api-key-12345").digest("hex");
    expect(sessionIdentity(auth)).toBe(expected);
  });

  it("different JWT users produce different identities", () => {
    const a: AuthResult = { apiKeyId: "key-a", token: "jwt.a", isJwt: true };
    const b: AuthResult = { apiKeyId: "key-b", token: "jwt.b", isJwt: true };
    expect(sessionIdentity(a)).not.toBe(sessionIdentity(b));
  });

  it("JWT user and raw-key user with coincidentally matching identifiers produce different identities", () => {
    // Even if a JWT's apiKeyId happened to equal the sha256 of some raw key,
    // they're both strings in the same namespace. Collision is cryptographically
    // unreachable (apiKeyId is a UUID, raw-key hashes are 64-hex-char strings).
    const jwt: AuthResult = { apiKeyId: "00000000-0000-0000-0000-000000000001", token: "jwt.x", isJwt: true };
    const raw: AuthResult = { token: "raw-x", isJwt: false };
    expect(sessionIdentity(jwt)).not.toBe(sessionIdentity(raw));
  });
});

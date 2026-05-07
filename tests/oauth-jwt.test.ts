import { describe, it, expect, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { signAccessToken, verifyAccessToken } from "../src/oauth/jwt.js";

const SECRET = "a".repeat(32);
const ROTATED_SECRET = `${"b".repeat(32)},${SECRET}`; // new primary, old still valid

const claims = {
  sub: "user-123",
  aud: "https://www.tradesapi.com/mcp",
  iss: "https://www.tradesapi.com",
  email: "user@example.com",
  scope: "mcp:tools",
  clientId: "client-abc",
};

describe("jwt", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it("signs and verifies a JWT with expected claims", async () => {
    const token = await signAccessToken(claims, 3600);
    const info = await verifyAccessToken(token, "https://www.tradesapi.com/mcp");
    expect(info.clientId).toBe("client-abc");
    expect(info.scopes).toEqual(["mcp:tools"]);
    expect(info.extra?.email).toBe("user@example.com");
    expect(info.extra?.sub).toBe("user-123");
  });

  it("rejects expired tokens", async () => {
    const token = await signAccessToken(claims, -10); // already expired
    await expect(
      verifyAccessToken(token, "https://www.tradesapi.com/mcp"),
    ).rejects.toThrow("token verification failed");
  });

  it("rejects wrong audience", async () => {
    const token = await signAccessToken(claims, 3600);
    await expect(
      verifyAccessToken(token, "https://evil.example.com"),
    ).rejects.toThrow("token verification failed");
  });

  it("preserves the underlying error as cause for debugging", async () => {
    const token = await signAccessToken(claims, -10);
    try {
      await verifyAccessToken(token, "https://www.tradesapi.com/mcp");
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.message).toBe("token verification failed");
      expect(err.cause).toBeDefined();
      expect(String(err.cause?.message ?? err.cause)).toMatch(/exp/i);
    }
  });

  it("rejects wrong issuer when expectedIssuer is provided", async () => {
    const token = await signAccessToken(claims, 3600);
    await expect(
      verifyAccessToken(
        token,
        "https://www.tradesapi.com/mcp",
        "https://evil.example.com",
      ),
    ).rejects.toThrow("token verification failed");
  });

  it("accepts matching issuer when expectedIssuer is provided", async () => {
    const token = await signAccessToken(claims, 3600);
    const info = await verifyAccessToken(
      token,
      "https://www.tradesapi.com/mcp",
      "https://www.tradesapi.com",
    );
    expect(info.clientId).toBe("client-abc");
  });

  it("verifies tokens signed with any key in rotation list", async () => {
    // Sign with old secret
    process.env.JWT_SECRET = SECRET;
    const oldToken = await signAccessToken(claims, 3600);
    // Rotate: new primary, old still accepted
    process.env.JWT_SECRET = ROTATED_SECRET;
    const info = await verifyAccessToken(oldToken, "https://www.tradesapi.com/mcp");
    expect(info.clientId).toBe("client-abc");
  });

  it("rejects tokens signed with retired key", async () => {
    // Sign with retired key
    process.env.JWT_SECRET = "c".repeat(32);
    const retired = await signAccessToken(claims, 3600);
    // Current keys do not include "ccc..."
    process.env.JWT_SECRET = ROTATED_SECRET;
    await expect(
      verifyAccessToken(retired, "https://www.tradesapi.com/mcp"),
    ).rejects.toThrow();
  });

  it("returns expiresAt in seconds since epoch", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signAccessToken(claims, 3600);
    const info = await verifyAccessToken(token, "https://www.tradesapi.com/mcp");
    expect(info.expiresAt).toBeGreaterThanOrEqual(before + 3599);
    expect(info.expiresAt).toBeLessThanOrEqual(before + 3601);
  });

  // Algorithm confusion / downgrade defense.
  // jose unconditionally rejects `alg: none`, so the load-bearing test for
  // our `algorithms: ["HS256"]` pin is a token signed with a DIFFERENT HMAC
  // alg using the same secret — without the pin, jose would accept it.
  it("rejects JWT signed with HS384 (algorithm-pin defense)", async () => {
    const secret = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({
      email: "x@test.com",
      scope: "mcp:tools",
      client_id: "client-abc",
    })
      .setProtectedHeader({ alg: "HS384", typ: "JWT" })
      .setIssuer("https://www.tradesapi.com")
      .setAudience("https://www.tradesapi.com/mcp")
      .setSubject("user-123")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);
    await expect(
      verifyAccessToken(token, "https://www.tradesapi.com/mcp"),
    ).rejects.toThrow("token verification failed");
  });

  it("rejects JWT signed with HS512 (algorithm-pin defense)", async () => {
    const secret = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({
      email: "x@test.com",
      scope: "mcp:tools",
      client_id: "client-abc",
    })
      .setProtectedHeader({ alg: "HS512", typ: "JWT" })
      .setIssuer("https://www.tradesapi.com")
      .setAudience("https://www.tradesapi.com/mcp")
      .setSubject("user-123")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);
    await expect(
      verifyAccessToken(token, "https://www.tradesapi.com/mcp"),
    ).rejects.toThrow("token verification failed");
  });
});

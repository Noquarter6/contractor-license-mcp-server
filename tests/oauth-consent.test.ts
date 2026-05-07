import { describe, it, expect } from "vitest";
import { renderConsent } from "../src/oauth/consent.js";

const baseClient = {
  client_id: "tradesapi_test_abc",
  client_name: "Claude Desktop",
  redirect_uris: ["https://claude.ai/api/mcp/callback"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
} as any;

describe("renderConsent", () => {
  it("surfaces the redirect_uri prominently (anti-phishing for DCR)", () => {
    const html = renderConsent({
      client: baseClient,
      scope: "mcp:tools",
      consentToken: "abc123",
      userEmail: "user@example.com",
      redirectUri: "https://claude.ai/api/mcp/callback",
    });
    expect(html).toContain("https://claude.ai/api/mcp/callback");
    expect(html).toContain("Your authorization will be sent to:");
  });

  it("highlights an attacker-controlled redirect_uri the same way", () => {
    // The defense relies on the user noticing the URL doesn't match what they
    // expected for the named client. The render must show the URL verbatim,
    // even when it's clearly suspicious.
    const html = renderConsent({
      client: { ...baseClient, client_name: "Claude Desktop" },
      scope: "mcp:tools",
      consentToken: "abc",
      userEmail: "victim@example.com",
      redirectUri: "https://evil.com/steal",
    });
    expect(html).toContain("https://evil.com/steal");
    expect(html).toContain("Only approve if you recognize this URL");
  });

  it("escapes the redirect_uri to prevent HTML injection", () => {
    const html = renderConsent({
      client: baseClient,
      scope: "mcp:tools",
      consentToken: "abc",
      userEmail: "u@e.com",
      redirectUri: 'https://evil.com/"><script>alert(1)</script>',
    });
    // The literal <script> tag must NOT appear unescaped
    expect(html).not.toContain("<script>alert(1)</script>");
    // The escaped form should appear instead
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not advertise the action as 'read-only' (it consumes credits)", () => {
    const html = renderConsent({
      client: baseClient,
      scope: "mcp:tools",
      consentToken: "abc",
      userEmail: "u@e.com",
      redirectUri: "https://example.com",
    });
    expect(html).not.toContain("read-only access");
    expect(html).toContain("consume credits");
  });

  it("falls back to a generic name when client_name is missing", () => {
    const html = renderConsent({
      client: { ...baseClient, client_name: undefined },
      scope: "mcp:tools",
      consentToken: "abc",
      userEmail: "u@e.com",
      redirectUri: "https://example.com",
    });
    expect(html).toContain("An MCP client");
  });
});

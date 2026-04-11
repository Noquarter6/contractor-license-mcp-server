import { describe, it, expect, vi } from "vitest";
import { handleVerify } from "../src/tools/verify.js";
import type { ApiClient } from "../src/api.js";

function mockClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    verify: vi.fn().mockResolvedValue({
      valid: true,
      name: "TEST USER",
      license_number: "12345",
      trade: "general",
      expiration: "12/31/2026",
      status: "Active",
      state: "TX",
      disciplinary_actions: [],
      source_url: "https://example.com",
      cached: false,
      checked_at: "2026-03-22T00:00:00Z",
    }),
    health: vi.fn(),
    ...overrides,
  } as any;
}

describe("handleVerify", () => {
  it("returns markdown by default", async () => {
    const client = mockClient();
    const result = await handleVerify(client, {
      state: "TX",
      license_number: "12345",
      trade: "general",
      force_refresh: false,
      response_format: "markdown",
    });
    expect(result.content[0].type).toBe("text");
    expect((result.content[0] as any).text).toContain("TEST USER");
    expect(client.verify).toHaveBeenCalledWith("TX", "12345", "general");
  });

  it("returns json when requested", async () => {
    const client = mockClient();
    const result = await handleVerify(client, {
      state: "TX",
      license_number: "12345",
      trade: "general",
      force_refresh: false,
      response_format: "json",
    });
    const parsed = JSON.parse((result.content[0] as any).text);
    expect(parsed.valid).toBe(true);
  });

  it("surfaces API errors as tool errors", async () => {
    const client = mockClient({
      verify: vi.fn().mockRejectedValue(new Error("Authentication failed")),
    });
    const result = await handleVerify(client, {
      state: "TX",
      license_number: "12345",
      trade: "general",
      force_refresh: false,
      response_format: "markdown",
    });
    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toContain("Authentication failed");
  });

  it("surfaces 'not yet supported' for valid-but-unsupported state", async () => {
    const client = mockClient({
      verify: vi.fn().mockRejectedValue(
        new Error("State 'NY' is not yet supported. Available: CA, FL, TX")
      ),
    });
    const result = await handleVerify(client, {
      state: "NY",
      license_number: "12345",
      trade: "general",
      force_refresh: false,
      response_format: "markdown",
    });
    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toContain("not yet supported");
  });
});

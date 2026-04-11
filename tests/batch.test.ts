import { describe, it, expect, vi } from "vitest";
import { handleBatchVerify } from "../src/tools/batch.js";
import type { ApiClient } from "../src/api.js";

function mockClient(): ApiClient {
  return {
    verify: vi.fn()
      .mockResolvedValueOnce({
        valid: true, name: "USER A", license_number: "111", trade: "general",
        state: "TX", status: "Active", expiration: "12/31/2026",
        disciplinary_actions: [], source_url: null, cached: false,
        checked_at: "2026-03-22T00:00:00Z",
      })
      .mockRejectedValueOnce(new Error("State 'NY' is not yet supported")),
    health: vi.fn(),
  } as any;
}

describe("handleBatchVerify", () => {
  it("handles partial success", async () => {
    const client = mockClient();
    const result = await handleBatchVerify(client, {
      licenses: [
        { state: "TX", license_number: "111", trade: "general" },
        { state: "NY", license_number: "222", trade: "general" },
      ],
      response_format: "markdown",
    });
    expect((result.content[0] as any).text).toContain("1/2 succeeded");
  });

  it("returns json format", async () => {
    const client = {
      verify: vi.fn().mockResolvedValue({
        valid: true, name: "USER A", license_number: "111", trade: "general",
        state: "TX", status: "Active", expiration: "12/31/2026",
        disciplinary_actions: [], source_url: null, cached: false,
        checked_at: "2026-03-22T00:00:00Z",
      }),
      health: vi.fn(),
    } as any;

    const result = await handleBatchVerify(client, {
      licenses: [{ state: "TX", license_number: "111", trade: "general" }],
      response_format: "json",
    });
    const parsed = JSON.parse((result.content[0] as any).text);
    expect(parsed.summary.total).toBe(1);
    expect(parsed.summary.succeeded).toBe(1);
  });
});

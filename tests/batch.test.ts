import { describe, it, expect, vi } from "vitest";
import { handleBatchVerify } from "../src/tools/batch.js";
import type { ApiClient } from "../src/api.js";

function mockClient(): ApiClient {
  return {
    batch: vi.fn().mockResolvedValue({
      summary: { total: 2, succeeded: 1, failed: 1 },
      results: [
        {
          result: {
            valid: true, name: "USER A", license_number: "111", trade: "general",
            state: "TX", status: "Active", expiration: "12/31/2026",
            disciplinary_actions: [], source_url: null, cached: false,
            checked_at: "2026-03-22T00:00:00Z",
          },
          error: null,
        },
        { result: null, error: "State 'NY' is not yet supported" },
      ],
    }),
    health: vi.fn(),
  } as any;
}

describe("handleBatchVerify", () => {
  it("issues a single POST /batch call (not N sequential verifies)", async () => {
    const client = mockClient();
    await handleBatchVerify(client, {
      licenses: [
        { state: "TX", license_number: "111", trade: "general" },
        { state: "NY", license_number: "222", trade: "general" },
      ],
      response_format: "markdown",
    });
    expect(client.batch).toHaveBeenCalledTimes(1);
    expect(client.batch).toHaveBeenCalledWith([
      { state: "TX", city: undefined, license: "111", trade: "general" },
      { state: "NY", city: undefined, license: "222", trade: "general" },
    ]);
  });

  it("renders partial-success summary in markdown", async () => {
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
      batch: vi.fn().mockResolvedValue({
        summary: { total: 1, succeeded: 1, failed: 0 },
        results: [
          {
            result: {
              valid: true, name: "USER A", license_number: "111", trade: "general",
              state: "TX", status: "Active", expiration: "12/31/2026",
              disciplinary_actions: [], source_url: null, cached: false,
              checked_at: "2026-03-22T00:00:00Z",
            },
            error: null,
          },
        ],
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

  it("forwards city for municipal items", async () => {
    const client = {
      batch: vi.fn().mockResolvedValue({
        summary: { total: 1, succeeded: 1, failed: 0 },
        results: [{
          result: {
            valid: true, name: "CHICAGO CO", license_number: "C-1", trade: "general",
            state: "IL", status: "Active", expiration: "12/31/2026",
            disciplinary_actions: [], source_url: null, cached: false,
            checked_at: "2026-03-22T00:00:00Z",
          },
          error: null,
        }],
      }),
      health: vi.fn(),
    } as any;

    await handleBatchVerify(client, {
      licenses: [{ state: "IL", city: "chicago", license_number: "C-1", trade: "general" }],
      response_format: "markdown",
    });
    expect(client.batch).toHaveBeenCalledWith([
      { state: "IL", city: "chicago", license: "C-1", trade: "general" },
    ]);
  });

  it("surfaces backend errors as tool errors", async () => {
    const client = {
      batch: vi.fn().mockRejectedValue(new Error("Authentication failed")),
      health: vi.fn(),
    } as any;
    const result = await handleBatchVerify(client, {
      licenses: [{ state: "TX", license_number: "111", trade: "general" }],
      response_format: "markdown",
    });
    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toContain("Authentication failed");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { ApiClient } from "../src/api.js";

vi.mock("axios");

describe("ApiClient", () => {
  let client: ApiClient;
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGet = vi.fn();
    vi.mocked(axios.create).mockReturnValue({ get: mockGet, post: vi.fn() } as any);
    client = new ApiClient("http://localhost:8000", "test-key");
  });

  it("calls /verify with correct params", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        valid: true,
        name: "Test User",
        license_number: "12345",
        trade: "general",
        state: "TX",
        disciplinary_actions: [],
        cached: false,
        checked_at: "2026-03-22T00:00:00Z",
      },
    });

    const result = await client.verify("TX", "12345", "general");
    expect(mockGet).toHaveBeenCalledWith("/verify", {
      params: { state: "TX", license: "12345", trade: "general" },
    });
    expect(result.valid).toBe(true);
  });

  it("calls /health", async () => {
    mockGet.mockResolvedValueOnce({
      data: { status: "healthy", api: "ok", database: "ok", redis: "ok" },
    });

    const result = await client.health();
    expect(result.status).toBe("healthy");
  });

  it("throws on 401 with helpful message", async () => {
    mockGet.mockRejectedValueOnce({
      response: { status: 401, data: { detail: "Invalid or inactive API key" } },
      isAxiosError: true,
    });

    await expect(client.verify("TX", "12345", "general")).rejects.toThrow(
      "Authentication failed"
    );
  });

  it("throws on 429 with retry-after", async () => {
    mockGet.mockRejectedValueOnce({
      response: {
        status: 429,
        data: { detail: "Rate limit exceeded" },
        headers: { "retry-after": "30" },
      },
      isAxiosError: true,
    });

    await expect(client.verify("TX", "12345", "general")).rejects.toThrow(
      "Rate limit exceeded"
    );
  });
});

import { describe, it, expect, vi } from "vitest";
import { handleSearchByName } from "../src/tools/search.js";
import type { ApiClient } from "../src/api.js";
import type { SearchResponse } from "../src/types.js";
import { formatSearchResults } from "../src/format.js";

const sampleSearchResponse: SearchResponse = {
  query: { state: "TX", name: "Anderson", trade: "general" },
  total_results: 2,
  results: [
    {
      name: "ANDERSON, ORIN RAE",
      license_number: "TACLA00000103C",
      trade: "hvac",
      status: "Active",
      state: "TX",
      confidence: 0.95,
      source_url: "https://www.tdlr.texas.gov/LicenseSearch/",
    },
    {
      name: "ANDERSON PLUMBING LLC",
      license_number: "MP12345",
      trade: "plumbing",
      status: "Active",
      state: "TX",
      confidence: 0.72,
      source_url: "https://www.tdlr.texas.gov/LicenseSearch/",
    },
  ],
  cached: false,
  checked_at: "2026-03-26T00:00:00Z",
};

function mockClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    verify: vi.fn(),
    search: vi.fn().mockResolvedValue(sampleSearchResponse),
    health: vi.fn(),
    ...overrides,
  } as any;
}

describe("handleSearchByName", () => {
  it("returns markdown by default", async () => {
    const client = mockClient();
    const result = await handleSearchByName(client, {
      state: "TX",
      name: "Anderson",
      trade: "general",
      limit: 20,
      response_format: "markdown",
    });
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Anderson");
    expect(result.content[0].text).toContain("ANDERSON, ORIN RAE");
    expect(result.content[0].text).toContain("2 results found");
    expect(client.search).toHaveBeenCalledWith("TX", "Anderson", "general", 20);
  });

  it("returns json when requested", async () => {
    const client = mockClient();
    const result = await handleSearchByName(client, {
      state: "TX",
      name: "Anderson",
      trade: "general",
      limit: 20,
      response_format: "json",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total_results).toBe(2);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].name).toBe("ANDERSON, ORIN RAE");
  });

  it("surfaces API errors as tool errors", async () => {
    const client = mockClient({
      search: vi.fn().mockRejectedValue(new Error("Authentication failed")),
    });
    const result = await handleSearchByName(client, {
      state: "TX",
      name: "Anderson",
      trade: "general",
      limit: 20,
      response_format: "markdown",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Authentication failed");
  });

  it("handles unsupported state errors", async () => {
    const client = mockClient({
      search: vi.fn().mockRejectedValue(
        new Error("Name search not yet supported for NY")
      ),
    });
    const result = await handleSearchByName(client, {
      state: "NY",
      name: "Smith",
      trade: "general",
      limit: 20,
      response_format: "markdown",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not yet supported");
  });

  it("handles empty results", async () => {
    const emptyResponse: SearchResponse = {
      query: { state: "TX", name: "ZZZZNONEXISTENT", trade: "general" },
      total_results: 0,
      results: [],
      cached: false,
      checked_at: "2026-03-26T00:00:00Z",
    };
    const client = mockClient({
      search: vi.fn().mockResolvedValue(emptyResponse),
    });
    const result = await handleSearchByName(client, {
      state: "TX",
      name: "ZZZZNONEXISTENT",
      trade: "general",
      limit: 20,
      response_format: "markdown",
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("0 results found");
    expect(result.content[0].text).toContain("No matching contractors found");
  });
});

describe("formatSearchResults", () => {
  it("formats as markdown with results", () => {
    const md = formatSearchResults(sampleSearchResponse, "markdown");
    expect(md).toContain('Name Search: "Anderson" in TX');
    expect(md).toContain("2 results found");
    expect(md).toContain("ANDERSON, ORIN RAE");
    expect(md).toContain("TACLA00000103C");
    expect(md).toContain("95%");
    expect(md).toContain("72%");
  });

  it("formats as json", () => {
    const json = formatSearchResults(sampleSearchResponse, "json");
    const parsed = JSON.parse(json);
    expect(parsed.total_results).toBe(2);
    expect(parsed.results[0].confidence).toBe(0.95);
    expect(parsed.query.name).toBe("Anderson");
  });

  it("handles empty results in markdown", () => {
    const emptyResponse: SearchResponse = {
      query: { state: "CA", name: "Nobody", trade: "general" },
      total_results: 0,
      results: [],
      cached: false,
      checked_at: "2026-03-26T00:00:00Z",
    };
    const md = formatSearchResults(emptyResponse, "markdown");
    expect(md).toContain("0 results found");
    expect(md).toContain("No matching contractors found");
  });

  it("shows cached status", () => {
    const cachedResponse = { ...sampleSearchResponse, cached: true };
    const md = formatSearchResults(cachedResponse, "markdown");
    expect(md).toContain("Cached: Yes");
  });
});

import { describe, it, expect } from "vitest";
import { handleListStates } from "../src/tools/states.js";
import type { ApiClient } from "../src/api.js";
import type { StatesApiResponse } from "../src/types.js";

// Minimal stub — only the .states() method is used by handleListStates.
function makeClient(response: StatesApiResponse): ApiClient {
  return {
    states: async () => response,
  } as unknown as ApiClient;
}

const FIXTURE: StatesApiResponse = {
  total_states: 3,
  total_municipalities: 1,
  states: [
    {
      code: "TX",
      name: "Texas",
      portal_url: "https://www.tdlr.texas.gov/LicenseSearch/",
      supported_trades: ["general", "hvac"],
      supports_name_search: true,
      status: "healthy",
      municipalities: [],
    },
    {
      code: "CA",
      name: "California",
      portal_url: "https://www.cslb.ca.gov/onlineservices/checkalicense/",
      supported_trades: ["general"],
      supports_name_search: false,
      status: "healthy",
      municipalities: [],
    },
    {
      code: "IL",
      name: "Illinois",
      portal_url: "https://idfpr.illinois.gov/",
      supported_trades: ["general"],
      supports_name_search: true,
      status: "degraded",
      municipalities: [
        {
          code: "IL_chicago",
          city: "Chicago",
          portal_url: "https://webapps1.chicago.gov/contractor/",
          supported_trades: ["general"],
          supports_name_search: true,
          status: "healthy",
        },
      ],
    },
  ],
};

describe("handleListStates", () => {
  it("returns supported states + cities as markdown", async () => {
    const client = makeClient(FIXTURE);
    const result = await handleListStates(client, { response_format: "markdown" });
    const text = (result.content[0] as any).text;
    expect(text).toContain("3 states + 1 cities");
    expect(text).toContain("### States");
    expect(text).toContain("### Cities");
    expect(text).toContain("TX");
    expect(text).toContain("CA");
    expect(text).toContain("IL");
    expect(text).toContain("IL_chicago");
    expect(text).toContain("Chicago");
    expect(text).toContain("OK");      // healthy → OK
    expect(text).toContain("DEGRADED"); // IL is degraded
  });

  it("omits the Cities section when the response has zero municipalities", async () => {
    const client = makeClient({ total_states: 1, total_municipalities: 0, states: [FIXTURE.states[0]!] });
    const result = await handleListStates(client, { response_format: "markdown" });
    const text = (result.content[0] as any).text;
    expect(text).toContain("Supported States");
    expect(text).not.toContain("### Cities");
  });

  it("returns supported states + cities as json", async () => {
    const client = makeClient(FIXTURE);
    const result = await handleListStates(client, { response_format: "json" });
    const parsed = JSON.parse((result.content[0] as any).text);
    expect(parsed.total_states).toBe(3);
    expect(parsed.total_municipalities).toBe(1);
    const codes = parsed.states.map((s: any) => s.code);
    expect(codes).toContain("TX");
    expect(codes).toContain("IL");
    const il = parsed.states.find((s: any) => s.code === "IL");
    expect(il.municipalities).toHaveLength(1);
    expect(il.municipalities[0].code).toBe("IL_chicago");
    expect(il.municipalities[0].city).toBe("Chicago");
    expect(il.municipalities[0].parent_state).toBe("IL");
  });

  it("adapts API field names (portal_url → portal, supported_trades → trades)", async () => {
    const client = makeClient(FIXTURE);
    const result = await handleListStates(client, { response_format: "json" });
    const parsed = JSON.parse((result.content[0] as any).text);
    const tx = parsed.states.find((s: any) => s.code === "TX");
    expect(tx.portal).toBe("https://www.tdlr.texas.gov/LicenseSearch/");
    expect(tx.trades).toEqual(["general", "hvac"]);
    expect(tx.supports_name_search).toBe(true);
    const chicago = parsed.states
      .find((s: any) => s.code === "IL")
      .municipalities[0];
    expect(chicago.portal).toBe("https://webapps1.chicago.gov/contractor/");
    expect(chicago.trades).toEqual(["general"]);
  });
});

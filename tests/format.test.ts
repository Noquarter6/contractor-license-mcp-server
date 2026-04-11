import { describe, it, expect } from "vitest";
import { formatLicenseResult, formatStatesList } from "../src/format.js";
import type { LicenseResult, StateInfo } from "../src/types.js";

const sampleResult: LicenseResult = {
  valid: true,
  name: "ANDERSON, ORIN RAE",
  license_number: "TACLA00000103C",
  trade: "hvac",
  expiration: "05/12/2026",
  status: "Active",
  state: "TX",
  disciplinary_actions: [],
  source_url: "https://www.tdlr.texas.gov/LicenseSearch/",
  cached: false,
  checked_at: "2026-03-22T00:00:00Z",
};

describe("formatLicenseResult", () => {
  it("formats as markdown", () => {
    const md = formatLicenseResult(sampleResult, "markdown");
    expect(md).toContain("ANDERSON, ORIN RAE");
    expect(md).toContain("Active");
    expect(md).toContain("TACLA00000103C");
  });

  it("formats as json", () => {
    const json = formatLicenseResult(sampleResult, "json");
    const parsed = JSON.parse(json);
    expect(parsed.valid).toBe(true);
    expect(parsed.name).toBe("ANDERSON, ORIN RAE");
  });
});

describe("formatStatesList", () => {
  const states: StateInfo[] = [
    { code: "TX", name: "Texas", portal: "https://tdlr.texas.gov", status: "healthy", trades: ["hvac", "electrical"] },
    { code: "CA", name: "California", portal: "https://cslb.ca.gov", status: "healthy", trades: ["general"] },
  ];

  it("formats as markdown", () => {
    const md = formatStatesList(states, "markdown");
    expect(md).toContain("TX");
    expect(md).toContain("Texas");
    expect(md).toContain("2 states");
  });

  it("formats as json", () => {
    const json = formatStatesList(states, "json");
    const parsed = JSON.parse(json);
    expect(parsed.states).toHaveLength(2);
    expect(parsed.total).toBe(2);
  });
});

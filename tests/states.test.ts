import { describe, it, expect } from "vitest";
import { handleListStates } from "../src/tools/states.js";

describe("handleListStates", () => {
  it("returns supported states as markdown", async () => {
    const result = await handleListStates({ response_format: "markdown" });
    expect((result.content[0] as any).text).toContain("TX");
    expect((result.content[0] as any).text).toContain("CA");
    expect((result.content[0] as any).text).toContain("FL");
    expect((result.content[0] as any).text).toContain("45 states");
  });

  it("returns supported states as json", async () => {
    const result = await handleListStates({ response_format: "json" });
    const parsed = JSON.parse((result.content[0] as any).text);
    expect(parsed.total).toBe(45);
    expect(parsed.states.map((s: any) => s.code)).toContain("CA");
    expect(parsed.states.map((s: any) => s.code)).toContain("TX");
    expect(parsed.states.map((s: any) => s.code)).toContain("WA");
    expect(parsed.states.map((s: any) => s.code)).toContain("KY");
    expect(parsed.states.map((s: any) => s.code)).toContain("UT");
  });
});

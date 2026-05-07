import { z } from "zod";
import { US_STATE_CODES } from "./constants.js";

const stateField = z
  .string()
  .length(2)
  .transform((s) => s.toUpperCase())
  .refine((s) => US_STATE_CODES.has(s), { message: "Invalid US state code" })
  .describe(
    "Two-letter US state code (e.g. 'CA', 'TX'). Call list_supported_states to see what's available — every US state is supported."
  );

const cityField = z
  .string()
  .min(1)
  .max(64)
  .transform((s) => s.toLowerCase())
  .describe(
    "Optional city slug for municipal contractor licensing. Use this when the contractor holds a city-issued license (some cities issue licenses in addition to or instead of state licenses). Lowercase, no spaces — e.g. 'chicago', 'nyc', 'philadelphia', 'detroit', 'atlanta', 'dallas', 'lasvegas', 'nashville'. Call list_supported_states to see registered cities under each state."
  );

const tradeField = z
  .string()
  .min(1)
  .max(50)
  .default("general")
  .describe(
    "Trade type — e.g. 'general', 'electrical', 'plumbing', 'hvac', 'mechanical', 'roofing'. Defaults to 'general' if omitted. Valid values vary by state; check list_supported_states.supported_trades for the jurisdiction."
  );

export const VerifyInputSchema = z.object({
  state: stateField,
  city: cityField.optional(),
  license_number: z
    .string()
    .min(1)
    .max(50)
    .describe(
      "The contractor's license number, exactly as printed on their license card (some states allow letters, dashes, or leading zeros — preserve them). Format varies by state."
    ),
  trade: tradeField,
  force_refresh: z
    .boolean()
    .default(false)
    .describe(
      "Bypass the 24-hour cache and fetch fresh data from the licensing portal. Use sparingly — uncached lookups take 5-30 seconds vs <100ms cached, and aggressive use can trigger portal-side rate limits."
    ),
  response_format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("Response format — 'markdown' for human-readable, 'json' for programmatic consumption."),
});

export const BatchInputSchema = z.object({
  licenses: z
    .array(
      z.object({
        state: stateField,
        city: cityField.optional(),
        license_number: z.string().min(1).max(50).describe("License number."),
        trade: tradeField,
      })
    )
    .min(1)
    .max(50)
    .describe("Array of licenses to verify (1-50 items per call). Each item can independently target a state or a state+city."),
  response_format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("Response format."),
});

export const SearchInputSchema = z.object({
  state: stateField,
  city: cityField.optional(),
  name: z
    .string()
    .min(2)
    .max(200)
    .describe(
      "Business or individual name to fuzzy-match against the licensing database. Case-insensitive; partial matches and reordered words ('Smith Plumbing' matches 'Plumbing Smith Inc') are supported."
    ),
  trade: tradeField,
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Maximum number of results to return (1-50, default 20). Results are ranked by name-match confidence."),
  response_format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("Response format."),
});

export const StatesInputSchema = z.object({
  response_format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("Response format."),
});

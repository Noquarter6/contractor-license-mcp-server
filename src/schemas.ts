import { z } from "zod";
import { US_STATE_CODES } from "./constants.js";

const stateField = z
  .string()
  .length(2)
  .transform((s) => s.toUpperCase())
  .refine((s) => US_STATE_CODES.has(s), { message: "Invalid US state code" })
  .describe(
    "Two-letter US state code (e.g. 'CA', 'TX', 'FL'). 45 states supported. Call clv_list_supported_states to see the full list with available trades."
  );

export const VerifyInputSchema = z.object({
  state: stateField,
  license_number: z
    .string()
    .min(1)
    .max(50)
    .describe(
      "The contractor's license number exactly as issued (e.g. 'TACLA00000103C' for TX HVAC, '1098765' for CA). Format varies by state."
    ),
  trade: z
    .string()
    .min(1)
    .max(50)
    .default("general")
    .describe(
      "Trade category: 'general', 'electrical', 'plumbing', 'hvac', 'mechanical', 'residential', or 'home_inspection'. Defaults to 'general'. Available trades vary by state — check clv_list_supported_states."
    ),
  force_refresh: z
    .boolean()
    .default(false)
    .describe("Bypass the 24-hour cache and re-fetch live from the state portal. Use when you need the most current data."),
  response_format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("Output format. 'markdown' is optimized for chat display with tables. 'json' returns structured data for programmatic use."),
});

export const BatchInputSchema = z.object({
  licenses: z
    .array(
      z.object({
        state: stateField,
        license_number: z.string().min(1).max(50).describe("License number exactly as issued. Format varies by state."),
        trade: z.string().min(1).max(50).default("general").describe("Trade category (e.g. 'general', 'electrical', 'plumbing', 'hvac'). Defaults to 'general'."),
      })
    )
    .min(1)
    .max(25)
    .describe("Array of licenses to verify (1-25 items). Each license is verified independently — a failure on one does not affect the others."),
  response_format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("Output format. 'markdown' is optimized for chat display. 'json' returns structured data for programmatic use."),
});

export const SearchInputSchema = z.object({
  state: stateField,
  name: z
    .string()
    .min(2)
    .max(200)
    .describe(
      "Business or individual name to search for. Partial matches are supported (e.g. 'Anderson' will match 'Anderson Electric LLC')."
    ),
  trade: z
    .string()
    .min(1)
    .max(50)
    .default("general")
    .describe(
      "Trade category to filter by: 'general', 'electrical', 'plumbing', 'hvac', etc. Defaults to 'general'. Check clv_list_supported_states for valid trades per state."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Maximum number of results to return. Defaults to 20, capped at 50."),
  response_format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("Output format. 'markdown' is optimized for chat display with tables. 'json' returns structured data for programmatic use."),
});

export const StatesInputSchema = z.object({
  response_format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("Output format. 'markdown' renders a table with state codes, names, status, and trades. 'json' returns a structured array."),
});

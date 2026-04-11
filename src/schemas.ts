import { z } from "zod";
import { US_STATE_CODES } from "./constants.js";

const stateField = z
  .string()
  .length(2)
  .transform((s) => s.toUpperCase())
  .refine((s) => US_STATE_CODES.has(s), { message: "Invalid US state code" })
  .describe(
    "Two-letter US state code (e.g. 'CA', 'TX'). Use clv_list_supported_states to see available states."
  );

export const VerifyInputSchema = z.object({
  state: stateField,
  license_number: z
    .string()
    .min(1)
    .max(50)
    .describe(
      "The contractor's license number as shown on their license card. Format varies by state."
    ),
  trade: z
    .string()
    .min(1)
    .max(50)
    .default("general")
    .describe(
      "The trade/contractor type (e.g. 'General Contractor', 'Electrical'). Use clv_list_supported_states to see valid values per state."
    ),
  force_refresh: z
    .boolean()
    .default(false)
    .describe("Bypass cache and fetch fresh data from the state portal."),
  response_format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("Response format."),
});

export const BatchInputSchema = z.object({
  licenses: z
    .array(
      z.object({
        state: stateField,
        license_number: z.string().min(1).max(50).describe("License number."),
        trade: z.string().min(1).max(50).default("general").describe("Trade type."),
      })
    )
    .min(1)
    .max(25)
    .describe("Array of licenses to verify (1-25 items)."),
  response_format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe("Response format."),
});

export const SearchInputSchema = z.object({
  state: stateField,
  name: z
    .string()
    .min(2)
    .max(200)
    .describe(
      "Business or individual name to search for in the state licensing database."
    ),
  trade: z
    .string()
    .min(1)
    .max(50)
    .default("general")
    .describe(
      "The trade/contractor type to filter by (e.g. 'General Contractor', 'Electrical'). Use clv_list_supported_states to see valid values per state."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Maximum number of results to return."),
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

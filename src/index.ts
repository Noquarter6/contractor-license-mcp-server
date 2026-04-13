#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ApiClient } from "./api.js";
import { VerifyInputSchema, BatchInputSchema, StatesInputSchema, SearchInputSchema } from "./schemas.js";
import { handleVerify } from "./tools/verify.js";
import { handleBatchVerify } from "./tools/batch.js";
import { handleListStates } from "./tools/states.js";
import { handleSearchByName } from "./tools/search.js";

function getConfig(): { apiUrl: string; apiKey: string } {
  const apiUrl = process.env.CLV_API_URL;
  const apiKey = process.env.CLV_API_KEY;

  if (!apiUrl) {
    console.error(
      "Error: CLV_API_URL environment variable is required.\n" +
        "Set it to https://www.tradesapi.com"
    );
    process.exit(1);
  }
  if (!apiKey) {
    console.error(
      "Error: CLV_API_KEY environment variable is required.\n" +
        "Get an API key from your CLV API admin."
    );
    process.exit(1);
  }

  return { apiUrl, apiKey };
}

async function main() {
  const { apiUrl, apiKey } = getConfig();
  const client = new ApiClient(apiUrl, apiKey);

  const server = new McpServer({
    name: "contractor-license-verification",
    version: "0.6.3",
  });

  server.registerTool(
    "clv_verify_license",
    {
      description:
        "Verify a single contractor license against a state licensing board portal. " +
        "Returns validity, licensee name, status, expiration date, and any disciplinary actions on file. " +
        "Use this when you have a specific license number to check. " +
        "Use clv_search_by_name instead when you only have a contractor's name. " +
        "Results are cached for 24 hours; set force_refresh to bypass. " +
        "Returns an error for unsupported states (check clv_list_supported_states first). " +
        "This is a read-only lookup that does not modify any licensing data.",
      inputSchema: VerifyInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => handleVerify(client, args)
  );

  server.registerTool(
    "clv_batch_verify",
    {
      description:
        "Verify multiple contractor licenses in a single request (1-25 items). " +
        "Each license is verified independently — individual failures do not block the batch. " +
        "Use this instead of multiple clv_verify_license calls when checking more than one license. " +
        "Returns a summary (succeeded/failed counts) plus per-license results with the same fields as clv_verify_license. " +
        "Returns an error if the array is empty or exceeds 25 items.",
      inputSchema: BatchInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => handleBatchVerify(client, args)
  );

  server.registerTool(
    "clv_list_supported_states",
    {
      description:
        "List all US states supported for contractor license verification, with portal URLs, health status, and available trades per state. " +
        "Call this before verifying to confirm a state and trade combination is supported. " +
        "Returns 45 states. Health status is 'healthy', 'degraded', or 'down'. " +
        "Does not make any network requests — the state list is embedded in the server.",
      inputSchema: StatesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => handleListStates(args)
  );

  server.registerTool(
    "clv_search_by_name",
    {
      description:
        "Search for contractors by business or individual name in a state licensing database. " +
        "Use this when you have a contractor's name but not their license number. " +
        "Use clv_verify_license instead when you already have the license number. " +
        "Returns matching contractors with license numbers, status, and confidence scores (0-1). " +
        "Partial name matches are supported. Results are capped by the limit parameter (default 20, max 50).",
      inputSchema: SearchInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => handleSearchByName(client, args)
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

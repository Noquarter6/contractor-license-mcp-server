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
        "Set it to your Contractor License Verification API URL (e.g. https://your-app.railway.app)"
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
    version: "0.1.0",
  });

  server.registerTool(
    "clv_verify_license",
    {
      description:
        "Verify a contractor's license by checking the state licensing board portal. " +
        "Returns license validity, holder name, status, expiration, and any disciplinary actions.",
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
        "Verify multiple contractor licenses in a single request (max 25). " +
        "Returns results for each license, with partial failure handling — individual failures don't block others.",
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
        "List all US states currently supported for contractor license verification, " +
        "including portal URLs, health status, and available trades.",
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
        "Returns matching contractors with license numbers, status, and confidence scores.",
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

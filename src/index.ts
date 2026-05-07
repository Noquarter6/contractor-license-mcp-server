#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ApiClient } from "./api.js";
import { createServer } from "./server.js";

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
  const server = createServer(client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

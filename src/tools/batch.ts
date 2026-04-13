import type { z } from "zod";
import type { ApiClient } from "../api.js";
import type { BatchInputSchema } from "../schemas.js";
import { formatBatchResponse } from "../format.js";
import type { BatchResponse, BatchResult } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

type BatchInput = z.output<typeof BatchInputSchema>;

export async function handleBatchVerify(
  client: ApiClient,
  args: BatchInput
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  const { licenses, response_format } = args;
  const results: BatchResult[] = [];

  for (const item of licenses) {
    try {
      const result = await client.verify(
        item.state,
        item.license_number,
        item.trade
      );
      results.push({ result, error: null });
    } catch (err: any) {
      results.push({ result: null, error: err.message ?? "Unknown error" });
    }
  }

  const succeeded = results.filter((r) => r.result !== null).length;
  const batch: BatchResponse = {
    summary: {
      total: licenses.length,
      succeeded,
      failed: licenses.length - succeeded,
    },
    results,
  };

  let text = formatBatchResponse(batch, response_format);
  if (text.length > CHARACTER_LIMIT) {
    text =
      text.slice(0, CHARACTER_LIMIT) +
      "\n\n[Output truncated — too many results]";
  }

  return { content: [{ type: "text", text }] };
}

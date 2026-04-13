import type { z } from "zod";
import type { ApiClient } from "../api.js";
import type { BatchInputSchema } from "../schemas.js";
import { formatBatchResponse, formatCredits } from "../format.js";
import type { BatchResponse, BatchResult, CreditInfo } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

type BatchInput = z.output<typeof BatchInputSchema>;

export async function handleBatchVerify(
  client: ApiClient,
  args: BatchInput
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  const { licenses, response_format } = args;
  const results: BatchResult[] = [];
  let lastCredits: CreditInfo = { remaining: null, charged: null };
  let totalCharged = 0;

  for (const item of licenses) {
    try {
      const { data, credits } = await client.verify(
        item.state,
        item.license_number,
        item.trade
      );
      results.push({ result: data, error: null });
      if (credits.charged != null) totalCharged += credits.charged;
      lastCredits = credits;
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

  const batchCredits: CreditInfo = {
    remaining: lastCredits.remaining,
    charged: totalCharged > 0 ? totalCharged : null,
  };

  const creditSuffix = response_format === "markdown" ? formatCredits(batchCredits) : "";
  let text = formatBatchResponse(batch, response_format) + creditSuffix;
  if (text.length > CHARACTER_LIMIT) {
    text =
      text.slice(0, CHARACTER_LIMIT) +
      "\n\n[Output truncated — too many results]";
  }

  return { content: [{ type: "text", text }] };
}

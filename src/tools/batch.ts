import type { z } from "zod";
import type { ApiClient } from "../api.js";
import type { BatchInputSchema } from "../schemas.js";
import { formatBatchResponse } from "../format.js";
import { CHARACTER_LIMIT } from "../constants.js";

type BatchInput = z.output<typeof BatchInputSchema>;

export async function handleBatchVerify(
  client: ApiClient,
  args: BatchInput
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  const { licenses, response_format } = args;

  let batch;
  try {
    batch = await client.batch(
      licenses.map((it) => ({
        state: it.state,
        city: it.city,
        license: it.license_number,
        trade: it.trade,
      }))
    );
  } catch (err: any) {
    return {
      content: [{ type: "text", text: err.message ?? "Batch verification failed" }],
      isError: true,
    };
  }

  let text = formatBatchResponse(batch, response_format);
  if (text.length > CHARACTER_LIMIT) {
    text =
      text.slice(0, CHARACTER_LIMIT) +
      "\n\n[Output truncated — too many results]";
  }

  return { content: [{ type: "text", text }] };
}

import type { z } from "zod";
import type { ApiClient } from "../api.js";
import type { VerifyInputSchema } from "../schemas.js";
import { formatLicenseResult } from "../format.js";

type VerifyInput = z.output<typeof VerifyInputSchema>;

export async function handleVerify(
  client: ApiClient,
  args: VerifyInput
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  const { state, license_number, trade, response_format } = args;

  try {
    const result = await client.verify(state, license_number, trade);
    return {
      content: [
        { type: "text", text: formatLicenseResult(result, response_format) },
      ],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: err.message ?? "Verification failed" }],
      isError: true,
    };
  }
}

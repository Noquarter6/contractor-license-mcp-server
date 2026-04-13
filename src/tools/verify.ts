import type { z } from "zod";
import type { ApiClient } from "../api.js";
import type { VerifyInputSchema } from "../schemas.js";
import { formatLicenseResult, formatCredits } from "../format.js";

type VerifyInput = z.output<typeof VerifyInputSchema>;

export async function handleVerify(
  client: ApiClient,
  args: VerifyInput
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  const { state, license_number, trade, response_format } = args;

  try {
    const { data, credits } = await client.verify(state, license_number, trade);
    const creditSuffix = response_format === "markdown" ? formatCredits(credits) : "";
    const text = formatLicenseResult(data, response_format) + creditSuffix;
    return {
      content: [{ type: "text", text }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: err.message ?? "Verification failed" }],
      isError: true,
    };
  }
}

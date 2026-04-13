import type { z } from "zod";
import type { ApiClient } from "../api.js";
import type { SearchInputSchema } from "../schemas.js";
import { formatSearchResults, formatCredits } from "../format.js";
import { CHARACTER_LIMIT } from "../constants.js";

type SearchInput = z.output<typeof SearchInputSchema>;

export async function handleSearchByName(
  client: ApiClient,
  args: SearchInput
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  const { state, name, trade, limit, response_format } = args;

  try {
    const { data, credits } = await client.search(state, name, trade, limit);
    const creditSuffix = response_format === "markdown" ? formatCredits(credits) : "";
    let text = formatSearchResults(data, response_format) + creditSuffix;
    if (text.length > CHARACTER_LIMIT) {
      text =
        text.slice(0, CHARACTER_LIMIT) +
        "\n\n[Output truncated — too many results]";
    }
    return {
      content: [{ type: "text", text }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: err.message ?? "Name search failed" }],
      isError: true,
    };
  }
}

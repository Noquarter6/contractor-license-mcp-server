import type { z } from "zod";
import type { StatesInputSchema } from "../schemas.js";
import { formatStatesList } from "../format.js";
import type { ApiClient } from "../api.js";
import type {
  MunicipalityInfo,
  StateInfo,
  StatesApiMunicipality,
  StatesApiRow,
} from "../types.js";

type StatesInput = z.output<typeof StatesInputSchema>;

// Adapt FastAPI's self-describing field names to StateInfo's legacy shape so
// existing format/output rendering keeps working without a breaking change.
function toMunicipalityInfo(m: StatesApiMunicipality, parentState: string): MunicipalityInfo {
  return {
    code: m.code,
    city: m.city,
    parent_state: parentState,
    portal: m.portal_url ?? "",
    status: m.status,
    trades: m.supported_trades,
    supports_name_search: m.supports_name_search,
  };
}

function toStateInfo(row: StatesApiRow): StateInfo {
  return {
    code: row.code,
    name: row.name,
    portal: row.portal_url ?? "",
    status: row.status,
    trades: row.supported_trades,
    supports_name_search: row.supports_name_search,
    municipalities: (row.municipalities ?? []).map((m) => toMunicipalityInfo(m, row.code)),
  };
}

export async function handleListStates(
  client: ApiClient,
  args: StatesInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  const format = args.response_format ?? "markdown";
  const { states } = await client.states();
  const adapted = states.map(toStateInfo);
  return {
    content: [
      { type: "text", text: formatStatesList(adapted, format) },
    ],
  };
}

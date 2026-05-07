import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiClient } from "./api.js";
import { VerifyInputSchema, BatchInputSchema, StatesInputSchema, SearchInputSchema } from "./schemas.js";
import { handleVerify } from "./tools/verify.js";
import { handleBatchVerify } from "./tools/batch.js";
import { handleListStates } from "./tools/states.js";
import { handleSearchByName } from "./tools/search.js";

const SERVER_NAME = "contractor-license-verification";
const SERVER_VERSION = "0.8.0";

export function createServer(client: ApiClient): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "verify_license",
    {
      title: "Verify Contractor License",
      description:
        "Verify a single US contractor's license against the official state (or city) licensing board. " +
        "USE WHEN: the user has a specific license number and wants to confirm it's valid, current, and free of disciplinary action — e.g. 'is TX license TACLA00000103C still active?', 'check if this electrician's license expired', 'pull disciplinary history for this contractor.' " +
        "DO NOT USE FOR: searching by contractor or business name when the license number is unknown (use search_by_name); discovering what states/cities are supported (use list_supported_states); verifying federal licenses, doctors/lawyers, or non-construction trades (out of scope). " +
        "RETURNS: {valid, name, license_number, trade, expiration, status, state, disciplinary_actions[], source_url, cached, checked_at}. Result is fetched live from the authoritative state portal; active licenses are cached 24h, expired/not-found results are always re-fetched. " +
        "EXAMPLE: state='TX', license_number='TACLA00000103C', trade='hvac' → {valid:true, name:'ANDERSON, ORIN RAE', status:'Active', expiration:'05/12/2026', source_url:'https://www.tdlr.texas.gov/...'}. " +
        "ERRORS: 400 INVALID_INPUT (malformed license/state/trade — fix the args and retry); 502 STATE_PORTAL_UNAVAILABLE (the state portal itself is down — retry after a few minutes); 429 RATE_LIMITED (back off and retry). All errors return a human-readable message; transient errors (502/429) are safe to retry, 400 is not.",
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
    "batch_verify",
    {
      title: "Verify Multiple Contractor Licenses",
      description:
        "Verify up to 50 contractor licenses in a single call. Items are dispatched concurrently against their respective state/city portals; one item failing does not abort the others. " +
        "USE WHEN: the user mentions verifying multiple licenses — phrases like 'I have 12 license numbers', 'verify these 5 contractors', 'bulk-check', 'verify them all', a list of subcontractors on a project, periodic compliance sweeps, COI/insurance review batches. **If the user has stated they want to verify N>1 licenses, this is the tool — don't fall back to list_supported_states first; the user already knows what they want to verify.** Even if the user hasn't pasted the list yet, batch_verify is the right next step (you can ask for the list, then call this). Cheaper in conversation turns than calling verify_license N times. " +
        "DO NOT USE FOR: a single license (use verify_license — clearer output); >50 licenses in one call (split into multiple batches); searches by name (use search_by_name); discovering what states are supported (use list_supported_states). " +
        "RETURNS: {summary: {total, succeeded, failed}, results: [{result, error}]} where each result is the same shape as verify_license, and `error` is non-null on per-item failures. Inspect individual `error` strings to retry just the failed items. " +
        "EXAMPLE: licenses=[{state:'TX', license_number:'TACLA00000103C', trade:'hvac'}, {state:'CA', license_number:'1234567', trade:'general'}] → {summary:{total:2, succeeded:2, failed:0}, results:[...]}. " +
        "ERRORS: per-item errors are reported in `results[i].error` rather than aborting the whole batch. Top-level 400 only fires on schema violations (e.g. >50 items, empty array).",
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
    "list_supported_states",
    {
      title: "List Supported Jurisdictions",
      description:
        "List every supported jurisdiction TradesAPI can verify contractor licenses against — all 50 US states, DC, and registered city-level licensing portals (Chicago, NYC, Philadelphia, Detroit, Atlanta, Dallas, Las Vegas, Nashville). " +
        "USE WHEN: the user asks 'what states do you cover', 'do you support [state]', 'which cities have municipal licensing'; before constructing a verify_license call when you're unsure of the trade vocabulary; to confirm a portal is currently healthy before a batch run. " +
        "DO NOT USE FOR: per-license verification (use verify_license); name searches (use search_by_name). " +
        "RETURNS: {total_states, total_municipalities, states: [{code, name, portal_url, supported_trades[], supports_name_search, status, municipalities: [{code, city, portal_url, ...}]}]}. `status` is 'healthy' | 'degraded' | 'maintenance'. `supported_trades` is the set of trade values observed in test fixtures (best-effort; some search-only states may return []). `supports_name_search` indicates whether the state's portal allows search_by_name queries. " +
        "EXAMPLE: returns 51 state rows (50 states + DC) with municipalities nested under their parent state — IL has Chicago nested, NY has NYC, etc. " +
        "ERRORS: 502 STATE_PORTAL_UNAVAILABLE only if the API itself is down; this tool reads from registry metadata, not state portals, so it's normally always available.",
      inputSchema: StatesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => handleListStates(client, args)
  );

  server.registerTool(
    "search_by_name",
    {
      title: "Search Contractors by Name",
      description:
        "Fuzzy-search contractors by business or individual name within a single state (or city) licensing database. " +
        "USE WHEN: the user has a contractor's name but not their license number — 'find Smith Plumbing in Texas', 'is there an active electrician named John Doe in California', vetting a contractor whose card you don't have in hand. Match is case-insensitive and tolerates partial words and reordered tokens (e.g. 'Smith Plumbing' matches 'Plumbing Smith Inc'). " +
        "DO NOT USE FOR: license-number lookup (use verify_license — it's faster and authoritative); discovery of what states are supported (use list_supported_states); states where supports_name_search:false (the call will 400 — check list_supported_states first). " +
        "RETURNS: {query: {state, name, trade}, total_results, results: [{name, license_number, trade, status, state, confidence, source_url}], cached, checked_at}. `confidence` is 0.0-1.0 (1.0 = exact match). Results are ranked by confidence descending. " +
        "EXAMPLE: state='TN', city='nashville', name='100 PERCENT PLUMBING', trade='plumbing' → {results: [{name: '100 PERCENT PLUMBING INC', license_number: '...', confidence: 0.95, ...}]}. " +
        "COST: this tool deducts 2 credits per call (vs 1 for verify_license) because name searches are more expensive — they may scrape multiple result pages. " +
        "ERRORS: 400 NAME_SEARCH_NOT_SUPPORTED (this state's portal doesn't expose a name-search endpoint — check list_supported_states.supports_name_search); 502 STATE_PORTAL_UNAVAILABLE (retry); 429 RATE_LIMITED (back off).",
      inputSchema: SearchInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args) => handleSearchByName(client, args)
  );

  return server;
}

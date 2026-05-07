#!/usr/bin/env node
/**
 * Tool-selection quality eval for the contractor-license-mcp-server.
 *
 * Each release of the MCP server should aim for >90% tool-selection accuracy
 * on the cases below — i.e. when an agent reads only the tool descriptions,
 * the right tool gets picked for the right phrasing. Per Phil Schmid: the
 * tool description IS the awareness funnel for an MCP-distributed API.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node mcp-server/dist/scripts/eval-tool-selection.js
 *   # or via tsx for direct .ts execution
 *
 * No npm dep on @anthropic-ai/sdk — uses fetch directly so this script
 * doesn't bloat the runtime package's deps.
 *
 * Cost note: a full run is ~12 Messages API calls with sonnet-4.6 (the
 * tool-using model); roughly a few cents. Run on every meaningful
 * description rewrite + before each version bump.
 */

const TOOL_DEFINITIONS = [
  {
    name: "verify_license",
    description:
      "Verify a single US contractor's license against the official state (or city) licensing board. " +
      "USE WHEN: the user has a specific license number and wants to confirm it's valid, current, and free of disciplinary action — e.g. 'is TX license TACLA00000103C still active?', 'check if this electrician's license expired', 'pull disciplinary history for this contractor.' " +
      "DO NOT USE FOR: searching by contractor or business name when the license number is unknown (use search_by_name); discovering what states/cities are supported (use list_supported_states); verifying federal licenses, doctors/lawyers, or non-construction trades (out of scope). " +
      "RETURNS: {valid, name, license_number, trade, expiration, status, state, disciplinary_actions[], source_url, cached, checked_at}. Result is fetched live from the authoritative state portal; active licenses are cached 24h, expired/not-found results are always re-fetched. " +
      "EXAMPLE: state='TX', license_number='TACLA00000103C', trade='hvac' → {valid:true, name:'ANDERSON, ORIN RAE', status:'Active', expiration:'05/12/2026', source_url:'https://www.tdlr.texas.gov/...'}. " +
      "ERRORS: 400 INVALID_INPUT (malformed license/state/trade — fix the args and retry); 502 STATE_PORTAL_UNAVAILABLE (the state portal itself is down — retry after a few minutes); 429 RATE_LIMITED (back off and retry). All errors return a human-readable message; transient errors (502/429) are safe to retry, 400 is not.",
    input_schema: {
      type: "object",
      properties: {
        state: { type: "string", description: "Two-letter US state code." },
        city: { type: "string", description: "Optional city slug for municipal portals (chicago, nyc, etc.)" },
        license_number: { type: "string" },
        trade: { type: "string" },
      },
      required: ["state", "license_number"],
    },
  },
  {
    name: "batch_verify",
    description:
      "Verify up to 25 contractor licenses in a single call. Each item runs sequentially against its respective state/city portal; one item failing does not abort the others. " +
      "USE WHEN: the user mentions verifying multiple licenses — phrases like 'I have 12 license numbers', 'verify these 5 contractors', 'bulk-check', 'verify them all', a list of subcontractors on a project, periodic compliance sweeps, COI/insurance review batches. **If the user has stated they want to verify N>1 licenses, this is the tool — don't fall back to list_supported_states first; the user already knows what they want to verify.** Even if the user hasn't pasted the list yet, batch_verify is the right next step (you can ask for the list, then call this). Cheaper in conversation turns than calling verify_license N times. " +
      "DO NOT USE FOR: a single license (use verify_license — clearer output); >25 licenses in one call (split into multiple batches); searches by name (use search_by_name); discovering what states are supported (use list_supported_states).",
    input_schema: {
      type: "object",
      properties: {
        licenses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              state: { type: "string" },
              city: { type: "string" },
              license_number: { type: "string" },
              trade: { type: "string" },
            },
            required: ["state", "license_number"],
          },
        },
      },
      required: ["licenses"],
    },
  },
  {
    name: "list_supported_states",
    description:
      "List every supported jurisdiction TradesAPI can verify contractor licenses against — all 50 US states, DC, and registered city-level licensing portals (Chicago, NYC, Philadelphia, Detroit, Atlanta, Dallas, Las Vegas, Nashville). " +
      "USE WHEN: the user asks 'what states do you cover', 'do you support [state]', 'which cities have municipal licensing'; before constructing a verify_license call when you're unsure of the trade vocabulary; to confirm a portal is currently healthy before a batch run. " +
      "DO NOT USE FOR: per-license verification (use verify_license); name searches (use search_by_name).",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "search_by_name",
    description:
      "Fuzzy-search contractors by business or individual name within a single state (or city) licensing database. " +
      "USE WHEN: the user has a contractor's name but not their license number — 'find Smith Plumbing in Texas', 'is there an active electrician named John Doe in California', vetting a contractor whose card you don't have in hand. " +
      "DO NOT USE FOR: license-number lookup (use verify_license — it's faster and authoritative); discovery of what states are supported (use list_supported_states); states where supports_name_search:false (the call will 400 — check list_supported_states first). " +
      "COST: this tool deducts 2 credits per call (vs 1 for verify_license).",
    input_schema: {
      type: "object",
      properties: {
        state: { type: "string" },
        city: { type: "string" },
        name: { type: "string" },
        trade: { type: "string" },
      },
      required: ["state", "name"],
    },
  },
];

interface TestCase {
  prompt: string;
  expected: string;
  reason?: string;
}

const TEST_CASES: TestCase[] = [
  // verify_license: clear single-license-with-number queries
  { prompt: "Is Texas license TACLA00000103C still active?", expected: "verify_license" },
  { prompt: "Check if California license 1234567 has expired.", expected: "verify_license" },
  { prompt: "Pull the disciplinary history for Florida CGC1234567.", expected: "verify_license" },

  // batch_verify: explicit lists. Test cases include the license numbers
  // inline so batch_verify is fully callable in one turn — the thing we
  // actually want to measure is route-on-presence-of-batch-data, not the
  // multi-turn "ask for list, then batch" workflow that real chats use.
  { prompt: "Verify these Texas licenses for me: TACLA00000103C, TACLA00000104D, TACLA00000105E. All HVAC.", expected: "batch_verify" },
  { prompt: "Bulk-check these contractors: TX/TACLA001 (hvac), CA/1234567 (general), FL/CGC1234567 (general).", expected: "batch_verify" },

  // list_supported_states: discovery / coverage
  { prompt: "What states do you cover?", expected: "list_supported_states" },
  { prompt: "Do you support municipal contractor licenses for Chicago?", expected: "list_supported_states" },
  { prompt: "Which states allow searching by contractor name?", expected: "list_supported_states", reason: "discovery question, even though it mentions 'searching'" },

  // search_by_name: name-only queries
  { prompt: "Find a contractor named Smith Plumbing in Texas.", expected: "search_by_name" },
  { prompt: "Is there an active electrician named John Doe in California?", expected: "search_by_name" },
  { prompt: "Search for plumbing contractors named Acme in Tennessee.", expected: "search_by_name" },

  // Out-of-scope: should still pick something sensible (probably list_supported_states or refuse)
  { prompt: "Verify a doctor's medical license in New York.", expected: "list_supported_states", reason: "out of scope; agent should check coverage before refusing" },
];

interface AnthropicResponse {
  content: Array<{ type: string; name?: string; input?: unknown; text?: string }>;
  stop_reason: string;
  model: string;
}

async function runCase(apiKey: string, model: string, tc: TestCase): Promise<{ tc: TestCase; picked: string | null; raw: string }> {
  const body = {
    model,
    max_tokens: 1024,
    tools: TOOL_DEFINITIONS,
    // For an eval we WANT to force the model to pick a tool — we're measuring
    // which-tool-given-it-uses-tools, not whether it decides to use tools.
    tool_choice: { type: "any" },
    messages: [
      { role: "user", content: tc.prompt },
    ],
  };
  // Retry on 529 (overloaded) — Anthropic's API throttles intermittently
  // and these are uninformative for an eval. 529 / 503 / 502 / 500 are all
  // safe to retry on idempotent reads.
  let resp!: Response;
  let lastBody = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (resp.ok) break;
    lastBody = await resp.text();
    const retriable = [502, 503, 529].includes(resp.status);
    if (!retriable || attempt === 3) break;
    const sleepMs = 500 * Math.pow(2, attempt); // 500ms, 1s, 2s
    await new Promise((r) => setTimeout(r, sleepMs));
  }
  if (!resp.ok) {
    return { tc, picked: null, raw: `HTTP ${resp.status} (after retries): ${lastBody}` };
  }
  const data = (await resp.json()) as AnthropicResponse;
  const toolUse = data.content.find((b) => b.type === "tool_use");
  if (toolUse) {
    return { tc, picked: toolUse.name ?? null, raw: data.stop_reason };
  }
  // No tool_use returned even with tool_choice: any. Capture the text so
  // failures are diagnosable instead of opaque.
  const textBlock = data.content.find((b) => b.type === "text");
  const preview = (textBlock?.text ?? "").slice(0, 120).replace(/\s+/g, " ");
  return { tc, picked: null, raw: `stop=${data.stop_reason} no_tool_use; text=${preview!}` };
}

async function main(): Promise<number> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set. Refusing to run silently.");
    console.error("Set it in your shell or run:");
    console.error("  ANTHROPIC_API_KEY=sk-... node mcp-server/dist/scripts/eval-tool-selection.js");
    return 2;
  }
  const model = process.env["EVAL_MODEL"] ?? "claude-sonnet-4-6";

  console.log(`Running ${TEST_CASES.length} cases against model=${model}\n`);

  let pass = 0;
  let fail = 0;
  const failures: Array<{ tc: TestCase; picked: string | null }> = [];

  for (const tc of TEST_CASES) {
    const result = await runCase(apiKey, model, tc);
    const ok = result.picked === tc.expected;
    if (ok) pass++;
    else {
      fail++;
      failures.push({ tc, picked: result.picked });
    }
    const mark = ok ? "PASS" : "FAIL";
    console.log(`[${mark}] expected=${tc.expected} picked=${result.picked ?? "<none>"} :: ${tc.prompt}`);
    if (!ok && !result.picked) {
      console.log(`         raw: ${result.raw}`);
    }
  }

  const accuracy = ((pass / TEST_CASES.length) * 100).toFixed(1);
  console.log(`\n${pass}/${TEST_CASES.length} (${accuracy}%) — target >= 90%`);

  if (failures.length > 0) {
    console.log("\nFailures (review tool descriptions for these):");
    for (const f of failures) {
      console.log(`  - "${f.tc.prompt}"`);
      console.log(`      expected ${f.tc.expected}, got ${f.picked}`);
      if (f.tc.reason) console.log(`      note: ${f.tc.reason}`);
    }
  }

  return failures.length > 0 ? 1 : 0;
}

main().then((code) => process.exit(code));

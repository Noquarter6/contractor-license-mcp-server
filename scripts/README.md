# mcp-server scripts

Dev-only utilities. Not shipped in the npm package (`files: ["dist"]` in
`package.json` excludes this directory).

## eval-tool-selection.ts

Tool-selection quality eval. Each release should aim for >90% on the test
cases in the script — i.e. when an agent reads only the tool descriptions,
the right tool is picked for the right user phrasing. The tool description
IS the awareness funnel for an MCP-distributed API; this eval tells you
whether your descriptions are doing the job.

### Run it

This directory is excluded from `tsc`'s `rootDir`. Run with `tsx`:

```bash
cd mcp-server
ANTHROPIC_API_KEY=sk-... npx tsx scripts/eval-tool-selection.ts
```

`tsx` runs TypeScript directly without a build step. `npx tsx` will fetch
it on first use; once cached, subsequent runs are immediate.

Override the model with `EVAL_MODEL=claude-opus-4-7` etc. — defaults to
`claude-sonnet-4-5` which is the cost/quality sweet spot for tool-using
agents in 2026.

### Cost

~12 Messages API calls. A few cents per run on Sonnet. Negligible.

### When to run

- After any tool description rewrite
- Before each version bump that changes tool surface
- As a regression check when reviewing tool changes in PRs

### What to do with failures

Read each failing case. The "fix" is almost always editing the tool
description in `mcp-server/src/server.ts` to make the right tool's WHEN-TO-USE
section more clearly match the user phrasing — and the wrong tool's
DO-NOT-USE-FOR section more clearly exclude it. Avoid chasing a single
phrasing into a description rewrite that hurts other cases; aim for the
rules that hold across the case set.

If a phrasing genuinely doesn't have a good answer (out-of-scope domain,
ambiguous request), update the test case's `expected` to the correct
fallback or remove the case.

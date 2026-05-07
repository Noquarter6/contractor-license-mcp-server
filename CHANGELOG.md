# Changelog

## 0.8.0 (2026-05-06) — BREAKING

Tool surface cleanup. The four tools were renamed (dropping the redundant `clv_` prefix), descriptions rewrote substantially, and an optional `city` parameter was added to `verify_license`, `batch_verify`, and `search_by_name` so callers can target municipal contractor licensing portals (Chicago, NYC, Philadelphia, Detroit, Atlanta, Dallas, Las Vegas, Nashville) without going through the state portal.

### Migration

| Old (≤ 0.7.1) | New (0.8.0+) |
|---|---|
| `clv_verify_license` | `verify_license` |
| `clv_batch_verify` | `batch_verify` |
| `clv_list_supported_states` | `list_supported_states` |
| `clv_search_by_name` | `search_by_name` |

If you have agent system prompts or `mcp__*` tool name references with the `clv_` prefix in them, update to the new names. The behavior, input shape (modulo the new optional `city` field), and output shape are unchanged.

### Added

- Optional `city` parameter on `verify_license`, `batch_verify` (per-license), and `search_by_name` for targeting municipal scrapers — e.g. `state="IL", city="chicago"` queries the Chicago contractor portal directly. Lowercase city slug; see `list_supported_states` output for available cities under each state.
- `list_supported_states` now returns nested municipalities under each state row plus `total_states` and `total_municipalities` counts.
- Tool descriptions rewritten to include WHEN-TO-USE / WHEN-NOT-TO-USE / RETURNS / EXAMPLE / ERRORS sections, raising tool-selection accuracy from agent runtimes.

### Changed

- `list_supported_states` proxies to `GET /states` on the backend instead of bundling a hardcoded state list. New jurisdictions ship instantly with no MCP republish.
- Status union accepts `"maintenance"` in addition to the prior `"healthy" | "degraded" | "down"`.
- Package + listing copy: all 50 US states + DC + 8 major-city portals.

### Removed

- The old `clv_*` tool names. There is no backward-compat alias; pin to `<= 0.7.1` if a clean break is unacceptable for your deployment.

## 0.1.0 (2026-03-24)

Initial release.

### Tools

- `clv_verify_license` -- verify a single contractor license against a state portal
- `clv_batch_verify` -- verify up to 25 licenses in one call with partial failure handling
- `clv_list_supported_states` -- list supported states, portals, and trades

### Supported States

- Texas (TDLR) -- hvac, electrical
- California (CSLB) -- general
- Florida (DBPR) -- general

### Features

- Markdown and JSON response formats
- Result caching (24h for valid, 1h for not-found)
- Rate limit handling with retry-after headers
- Claude Desktop configuration via `npx`

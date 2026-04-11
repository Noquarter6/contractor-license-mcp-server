# Changelog

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

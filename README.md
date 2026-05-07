# contractor-license-mcp-server

**Real-time contractor license verification across all 50 US states + DC, plus 8 major-city contractor licensing portals (Chicago, NYC, Philadelphia, Detroit, Atlanta, Dallas, Las Vegas, Nashville).** An [MCP server](https://modelcontextprotocol.io) that lets Claude Desktop, Claude Code, Cursor, Windsurf, and any MCP-compatible AI agent verify a contractor's license, status, expiration, and disciplinary history directly against licensing board portals.

Send `{state, license_number, trade}` — get back validity, licensee name, expiration date, status, and any disciplinary actions on file. Results are fetched live from official state portals (no stale nightly exports) and cached for 24 hours when active.

## Why this server

- **All 50 US states + DC + 8 major cities** covered via official licensing board portals, not third-party data aggregators
- **Live lookups** — each verification hits the authoritative portal, so expirations and disciplinary actions are as fresh as the board's own data
- **Batch verification** — up to 25 licenses per call, run in parallel
- **Disciplinary history** — returned when the portal exposes it
- Backed by [TradesAPI](https://www.tradesapi.com), a hosted HTTP API you can also hit directly

## Quick start

### Hosted (recommended)

No install required. Add this to your Claude Desktop config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tradesapi": {
      "type": "streamable-http",
      "url": "https://www.tradesapi.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

Replace `YOUR_API_KEY` with the key from your dashboard and restart Claude Desktop.

### Local install (alternative)

If you prefer to run the MCP server locally via stdio:

```json
{
  "mcpServers": {
    "tradesapi": {
      "command": "npx",
      "args": ["-y", "contractor-license-mcp-server"],
      "env": {
        "CLV_API_URL": "https://www.tradesapi.com",
        "CLV_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### Getting an API key

1. Go to [www.tradesapi.com](https://www.tradesapi.com) and click **Sign up free**
2. Enter your email — you'll get a magic link
3. Click the link and land on your dashboard, where your API key is waiting

New accounts start with **50 free verification credits**, no credit card required. You can purchase additional credit packs from the dashboard when you need more.

### Direct install

```bash
npm install -g contractor-license-mcp-server
```

## Tools

### `verify_license`

Verify a single contractor license against the official state (or city) licensing portal.

| Parameter | Required | Description |
|---|---|---|
| `state` | yes | Two-letter state code (`CA`, `TX`, `FL`, ...) |
| `city` | no | Optional city slug to target a municipal portal: `chicago`, `nyc`, `philadelphia`, `detroit`, `atlanta`, `dallas`, `lasvegas`, `nashville`. Lowercase, no spaces. |
| `license_number` | yes | The license number to verify |
| `trade` | no | `general`, `electrical`, `plumbing`, `hvac`, `mechanical`, `roofing`, `residential`, ... (defaults to `general`) |
| `force_refresh` | no | Bypass the 24h cache and re-fetch from the portal |
| `response_format` | no | `markdown` (default) or `json` |

**Example result:**

```
## License Verification: VALID

| Field      | Value                    |
|------------|--------------------------|
| Name       | ANDERSON, ORIN RAE       |
| License #  | TACLA00000103C           |
| State      | TX                       |
| Trade      | hvac                     |
| Status     | Active                   |
| Expiration | 05/12/2026               |
```

### `batch_verify`

Verify up to 25 licenses in a single call. Each verification runs independently — partial failures do not block the batch. Per-item `city` is supported.

| Parameter | Required | Description |
|---|---|---|
| `licenses` | yes | Array of `{ state, city?, license_number, trade }` objects (1–25 items) |
| `response_format` | no | `markdown` (default) or `json` |

### `search_by_name`

Fuzzy-match contractors by business or individual name within a single state (or city) database. Costs 2 credits per call.

| Parameter | Required | Description |
|---|---|---|
| `state` | yes | Two-letter state code |
| `city` | no | Optional city slug for municipal databases |
| `name` | yes | Business or individual name (case-insensitive, partial-match tolerant) |
| `trade` | no | Trade filter |
| `limit` | no | Max results (1–50, default 20) |
| `response_format` | no | `markdown` (default) or `json` |

Not every state portal supports name search — call `list_supported_states` and check `supports_name_search` per jurisdiction first.

### `list_supported_states`

List every supported jurisdiction with portal URLs, current health, available trades, and registered municipal scrapers nested under each state. Use this to discover what's reachable before constructing other tool calls.

| Parameter | Required | Description |
|---|---|---|
| `response_format` | no | `markdown` (default) or `json` |

## Coverage

All 50 US states + DC at the state level, plus 8 major-city contractor licensing portals (Chicago, NYC, Philadelphia, Detroit, Atlanta, Dallas, Las Vegas, Nashville).

Run `list_supported_states` from your agent for the live, fetched-fresh-each-call list of supported jurisdictions, available trades per jurisdiction, current portal health, and which states support name search. The MCP package no longer bundles a static state table — what comes back from `list_supported_states` is always current with prod.

You can also see the live state grid at [www.tradesapi.com](https://www.tradesapi.com).

## Configuration

| Variable | Required | Description |
|---|---|---|
| `CLV_API_URL` | yes | API backend URL (use `https://www.tradesapi.com`) |
| `CLV_API_KEY` | yes | Your API key from the dashboard |

## Credits

Each license verification consumes **1 credit**, whether the result is fresh or cached. New accounts receive **50 free credits**. Additional credit packs can be purchased from the dashboard at [www.tradesapi.com](https://www.tradesapi.com).

## Development

```bash
git clone https://github.com/jackunderwood/Contractor-License-Verification.git
cd Contractor-License-Verification/mcp-server
npm install
npm run build
npm test
```

## License

MIT

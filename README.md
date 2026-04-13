# contractor-license-mcp-server

**Real-time contractor license verification across 45 US states.** An [MCP server](https://modelcontextprotocol.io) that lets Claude Desktop, Cursor, and any MCP-compatible AI agent verify a contractor's license, status, expiration, and disciplinary history directly against state licensing board portals.

Send `{state, license_number, trade}` — get back validity, licensee name, expiration date, status, and any disciplinary actions on file. Results are fetched live from official state portals (no stale nightly exports) and cached for 24 hours when active.

## Why this server

- **45 states** covered via official state licensing board portals, not third-party data aggregators
- **Live lookups** — each verification hits the authoritative portal, so expirations and disciplinary actions are as fresh as the board's own data
- **Batch verification** — up to 25 licenses per call, run in parallel
- **Disciplinary history** — returned when the portal exposes it
- Backed by [TradesAPI](https://www.tradesapi.com), a hosted HTTP API you can also hit directly

## Quick start

### Claude Desktop

Add this to your Claude Desktop config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

### `clv_verify_license`

Verify a single contractor license against a state licensing board portal.

| Parameter | Required | Description |
|---|---|---|
| `state` | yes | Two-letter state code (`CA`, `TX`, `FL`, ...) |
| `license_number` | yes | The license number to verify |
| `trade` | no | `general`, `electrical`, `plumbing`, `hvac`, `mechanical`, `residential`, or `home_inspection` (defaults to `general`) |
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

### `clv_batch_verify`

Verify up to 25 licenses in a single call. Each verification runs independently — partial failures do not block the batch.

| Parameter | Required | Description |
|---|---|---|
| `licenses` | yes | Array of `{ state, license_number, trade }` objects (1–25 items) |
| `response_format` | no | `markdown` (default) or `json` |

### `clv_list_supported_states`

List all supported states, including portal URLs and available trades. Use this to see which states and trades you can query.

| Parameter | Required | Description |
|---|---|---|
| `response_format` | no | `markdown` (default) or `json` |

## Supported states

| Code | State | Trades |
|---|---|---|
| AK | Alaska | general, electrical, mechanical |
| AL | Alabama | general, electrical, plumbing, hvac, residential |
| AR | Arkansas | general |
| AZ | Arizona | general, electrical, plumbing, hvac |
| CA | California | general, electrical, plumbing, hvac |
| CO | Colorado | electrical, plumbing |
| CT | Connecticut | general, electrical, plumbing, hvac |
| DC | District of Columbia | general |
| DE | Delaware | electrical, plumbing, hvac |
| FL | Florida | general, electrical, plumbing, hvac |
| GA | Georgia | general |
| HI | Hawaii | general |
| IA | Iowa | electrical |
| ID | Idaho | electrical, plumbing, hvac |
| IL | Illinois | general, electrical, plumbing, hvac |
| IN | Indiana | plumbing |
| KY | Kentucky | general, electrical, hvac, plumbing |
| LA | Louisiana | general |
| MA | Massachusetts | general, mechanical |
| MD | Maryland | general, hvac, electrical, plumbing |
| ME | Maine | electrical, plumbing |
| MI | Michigan | electrical, plumbing, hvac |
| MN | Minnesota | general, electrical, plumbing |
| MS | Mississippi | general |
| NC | North Carolina | general |
| ND | North Dakota | general, electrical |
| NE | Nebraska | general, electrical |
| NH | New Hampshire | electrical, plumbing |
| NJ | New Jersey | general, electrical, hvac, plumbing |
| NM | New Mexico | general, electrical, plumbing, hvac |
| NV | Nevada | general, electrical, plumbing, hvac |
| NY | New York | home_inspection |
| OH | Ohio | general, electrical, plumbing, hvac |
| OK | Oklahoma | electrical, plumbing, hvac |
| OR | Oregon | general |
| PA | Pennsylvania | general, electrical, hvac, plumbing |
| RI | Rhode Island | general |
| SC | South Carolina | general, electrical, plumbing, hvac |
| TN | Tennessee | general, electrical, plumbing |
| TX | Texas | hvac, electrical, plumbing |
| UT | Utah | general, electrical, plumbing, hvac |
| VA | Virginia | general, electrical, plumbing, hvac |
| VT | Vermont | electrical, plumbing |
| WA | Washington | general |
| WV | West Virginia | general, electrical, hvac, plumbing |

Coverage expands continuously. Run `clv_list_supported_states` from your agent for the current list, or see the live state grid at [www.tradesapi.com](https://www.tradesapi.com).

## Configuration

| Variable | Required | Description |
|---|---|---|
| `CLV_API_URL` | yes | API backend URL (use `https://www.tradesapi.com`) |
| `CLV_API_KEY` | yes | Your API key from the dashboard |

## Credits

Each license verification consumes **1 credit**, whether the result is fresh or cached. New accounts receive **50 free credits**. Additional credit packs can be purchased from the dashboard at [www.tradesapi.com](https://www.tradesapi.com).

## Development

```bash
git clone https://github.com/Noquarter6/contractor-license-mcp-server.git
cd contractor-license-mcp-server
npm install
npm run build
npm test
```

## License

MIT

// mcp-server/src/oauth/consent.ts
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ConsentContext {
  client: OAuthClientInformationFull;
  scope: string;
  consentToken: string; // random one-shot token, Redis-bound to pending authorize params
  userEmail: string;
  redirectUri: string; // where the auth code will be sent — surface to the user
}

/**
 * Render the consent page. Minimal, inline styles. Posts to /oauth/consent.
 *
 * Anti-phishing: DCR is trust-on-first-use. A malicious client can register
 * with a benign client_name and an attacker-controlled redirect_uri. Showing
 * the redirect_uri prominently is the user's only chance to spot the swap
 * before approving.
 */
export function renderConsent(ctx: ConsentContext): string {
  const clientName = ctx.client.client_name ?? "An MCP client";
  const scopes = ctx.scope.split(" ").filter(Boolean);
  const scopeList = scopes.length
    ? scopes.map((s) => `<li><code>${escape(s)}</code></li>`).join("")
    : "<li>(no scopes requested)</li>";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Authorize ${escape(clientName)} – TradesAPI</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f7f8; color: #111; margin: 0; padding: 40px 20px; }
    .card { max-width: 480px; margin: 40px auto; background: #fff; border: 1px solid #e5e5e7; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p.user { color: #666; font-size: 14px; margin: 0 0 24px; }
    .box { border: 1px solid #e5e5e7; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .box strong { display: block; font-size: 14px; margin-bottom: 8px; }
    .box.redirect { background: #fefce8; border-color: #fde68a; }
    .box.redirect .url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; word-break: break-all; color: #111; background: #fff; padding: 8px 10px; border-radius: 4px; border: 1px solid #fde68a; }
    .box.redirect p.warn { color: #92400e; font-size: 12px; margin: 8px 0 0; }
    ul { margin: 0; padding-left: 20px; font-size: 14px; color: #333; }
    ul code { background: #f0f0f1; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .buttons { display: flex; gap: 12px; margin-top: 8px; }
    button { flex: 1; padding: 12px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; border: 1px solid transparent; }
    button.authorize { background: #111; color: #fff; }
    button.deny { background: #fff; color: #111; border-color: #d4d4d8; }
    button:hover { opacity: 0.9; }
    .fineprint { color: #888; font-size: 12px; margin-top: 24px; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize ${escape(clientName)}</h1>
    <p class="user">Signed in as <strong>${escape(ctx.userEmail)}</strong></p>
    <div class="box">
      <strong>This application will be able to:</strong>
      <ul>${scopeList}</ul>
    </div>
    <div class="box redirect">
      <strong>Your authorization will be sent to:</strong>
      <div class="url">${escape(ctx.redirectUri)}</div>
      <p class="warn">Only approve if you recognize this URL as belonging to ${escape(clientName)}.</p>
    </div>
    <form method="POST" action="/oauth/consent">
      <input type="hidden" name="consent_token" value="${escape(ctx.consentToken)}">
      <div class="buttons">
        <button type="submit" name="decision" value="deny" class="deny">Deny</button>
        <button type="submit" name="decision" value="allow" class="authorize">Authorize</button>
      </div>
    </form>
    <p class="fineprint">
      Authorization lets ${escape(clientName)} call TradesAPI tools on your behalf.
      Tool calls consume credits from your account. You can revoke access at any
      time from your <a href="/dashboard">dashboard</a>.
    </p>
  </div>
</body>
</html>`;
}

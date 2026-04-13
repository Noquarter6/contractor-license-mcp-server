import type { LicenseResult, StateInfo, BatchResponse, SearchResponse, CreditInfo } from "./types.js";

function normalizeStatus(status: string | null): string {
  if (!status) return "N/A";
  const s = status.toLowerCase();
  if (s === "not_found" || s === "not found") return "Not Found";
  if (s === "unknown") return "Unknown (lookup may have failed)";
  return status;
}

export function formatCredits(credits: CreditInfo): string {
  const parts: string[] = [];
  if (credits.charged != null) parts.push(`Credits used: ${credits.charged}`);
  if (credits.remaining != null) parts.push(`Credits remaining: ${credits.remaining}`);
  return parts.length > 0 ? `\n\n---\n${parts.join(" | ")}` : "";
}

export function formatLicenseResult(
  result: LicenseResult,
  format: "markdown" | "json"
): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }

  const status = result.valid ? "VALID" : "INVALID";
  const lines = [
    `## License Verification: ${status}`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| Name | ${result.name ?? "N/A"} |`,
    `| License # | ${result.license_number} |`,
    `| State | ${result.state} |`,
    `| Trade | ${result.trade} |`,
    `| Status | ${normalizeStatus(result.status)} |`,
    `| Expiration | ${result.expiration ?? "N/A"} |`,
    `| Source | ${result.source_url ?? "N/A"} |`,
    `| Cached | ${result.cached ? "Yes" : "No"} |`,
    `| Checked | ${result.checked_at} |`,
  ];

  if (result.disciplinary_actions.length > 0) {
    lines.push("", "### Disciplinary Actions");
    for (const action of result.disciplinary_actions) {
      if (typeof action === "string") {
        lines.push(`- ${action}`);
      } else if (action && typeof action === "object" && "description" in action) {
        lines.push(`- ${(action as { description: string }).description}`);
      } else {
        lines.push(`- ${JSON.stringify(action)}`);
      }
    }
  }

  return lines.join("\n");
}

export function formatStatesList(
  states: StateInfo[],
  format: "markdown" | "json"
): string {
  if (format === "json") {
    return JSON.stringify({ states, total: states.length }, null, 2);
  }

  const lines = [
    `## Supported States (${states.length} states)`,
    "",
    "| State | Name | Status | Trades |",
    "|-------|------|--------|--------|",
  ];

  for (const s of states) {
    const statusIcon =
      s.status === "healthy"
        ? "OK"
        : s.status === "degraded"
          ? "DEGRADED"
          : "DOWN";
    lines.push(
      `| ${s.code} | ${s.name} | ${statusIcon} | ${s.trades.join(", ")} |`
    );
  }

  return lines.join("\n");
}

export function formatBatchResponse(
  batch: BatchResponse,
  format: "markdown" | "json"
): string {
  if (format === "json") {
    return JSON.stringify(batch, null, 2);
  }

  const { summary, results } = batch;
  const lines = [
    `## Batch Verification: ${summary.succeeded}/${summary.total} succeeded`,
    "",
  ];

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    if (item.result) {
      lines.push(
        `### ${i + 1}. ${item.result.license_number} (${item.result.state})`
      );
      lines.push(item.result.valid ? "**VALID**" : "**INVALID**");
      if (item.result.name) lines.push(`Name: ${item.result.name}`);
      if (item.result.status) lines.push(`Status: ${normalizeStatus(item.result.status)}`);
      lines.push("");
    } else {
      lines.push(`### ${i + 1}. ERROR`);
      lines.push(item.error ?? "Unknown error");
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function formatSearchResults(
  response: SearchResponse,
  format: "markdown" | "json"
): string {
  if (format === "json") {
    return JSON.stringify(response, null, 2);
  }

  const { query, total_results, results, cached, checked_at } = response;
  const lines = [
    `## Name Search: "${query.name}" in ${query.state}`,
    "",
    `**${total_results} result${total_results === 1 ? "" : "s"} found** | Trade: ${query.trade} | Cached: ${cached ? "Yes" : "No"} | Checked: ${checked_at}`,
    "",
  ];

  if (results.length === 0) {
    lines.push("No matching contractors found.");
  } else {
    lines.push(
      "| # | Name | License # | Trade | Status | Confidence |",
      "|---|------|-----------|-------|--------|------------|"
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const conf = `${Math.round(r.confidence * 100)}%`;
      lines.push(
        `| ${i + 1} | ${r.name} | ${r.license_number} | ${r.trade} | ${r.status ?? "N/A"} | ${conf} |`
      );
    }
  }

  return lines.join("\n");
}

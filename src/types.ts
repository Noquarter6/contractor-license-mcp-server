export interface LicenseResult {
  valid: boolean;
  name: string | null;
  license_number: string;
  trade: string;
  expiration: string | null;
  status: string | null;
  state: string;
  disciplinary_actions: string[];
  source_url: string | null;
  cached: boolean;
  checked_at: string;
}

export interface StateInfo {
  code: string;
  name: string;
  portal: string;
  status: "healthy" | "degraded" | "down";
  trades: string[];
}

export interface BatchItem {
  state: string;
  license_number: string;
  trade: string;
}

export interface BatchResult {
  result: LicenseResult | null;
  error: string | null;
}

export interface BatchResponse {
  summary: { total: number; succeeded: number; failed: number };
  results: BatchResult[];
}

export interface SearchResultItem {
  name: string;
  license_number: string;
  trade: string;
  status: string | null;
  state: string;
  confidence: number;
  source_url: string | null;
}

export interface SearchResponse {
  query: { state: string; name: string; trade: string };
  total_results: number;
  results: SearchResultItem[];
  cached: boolean;
  checked_at: string;
}

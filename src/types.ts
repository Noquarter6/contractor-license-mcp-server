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
  status: "healthy" | "degraded" | "maintenance" | "down";
  trades: string[];
  supports_name_search?: boolean;
  municipalities?: MunicipalityInfo[];
}

export interface MunicipalityInfo {
  code: string;          // composite jurisdiction code, e.g. "IL_chicago"
  city: string;          // display name, e.g. "Chicago"
  parent_state: string;  // state code, e.g. "IL"
  portal: string;
  status: "healthy" | "degraded" | "maintenance" | "down";
  trades: string[];
  supports_name_search?: boolean;
}

// Wire format from FastAPI's GET /states endpoint. Field names favor
// self-description for non-MCP integrations; tools/states.ts adapts to
// StateInfo's legacy shape.
export interface StatesApiMunicipality {
  code: string;
  city: string;
  portal_url: string | null;
  supported_trades: string[];
  supports_name_search: boolean;
  status: "healthy" | "degraded" | "maintenance";
}

export interface StatesApiRow {
  code: string;
  name: string;
  portal_url: string | null;
  supported_trades: string[];
  supports_name_search: boolean;
  status: "healthy" | "degraded" | "maintenance";
  municipalities: StatesApiMunicipality[];
}

export interface StatesApiResponse {
  total_states: number;
  total_municipalities: number;
  states: StatesApiRow[];
}

export interface BatchItem {
  state: string;
  city?: string;
  license: string;
  trade: string;
}

export interface BatchResult {
  result: LicenseResult | null;
  error: string | null;
}

// Wire format from FastAPI's POST /batch endpoint. ApiClient.batch() adapts
// this into the MCP-internal BatchResponse shape used by formatBatchResponse.
export interface BackendBatchResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: BatchResult[];
  credits_charged: number;
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

import axios, { AxiosInstance } from "axios";
import type {
  BackendBatchResponse,
  BatchItem,
  BatchResponse,
  LicenseResult,
  SearchResponse,
  StatesApiResponse,
} from "./types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public retryAfter?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  private http: AxiosInstance;

  constructor(baseURL: string, apiKey: string, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extraHeaders };
    if (apiKey) headers["X-API-Key"] = apiKey;
    this.http = axios.create({
      baseURL,
      headers,
      timeout: 120_000,
    });
  }

  async verify(
    state: string,
    licenseNumber: string,
    trade: string,
    city?: string,
    forceRefresh?: boolean
  ): Promise<LicenseResult> {
    try {
      const params: Record<string, string> = { state, license: licenseNumber, trade };
      if (city) params.city = city;
      if (forceRefresh) params.fresh = "true";
      const { data } = await this.http.get<LicenseResult>("/verify", { params });
      return data;
    } catch (err: any) {
      throw this.wrapError(err);
    }
  }

  async batch(items: BatchItem[]): Promise<BatchResponse> {
    try {
      const body = {
        licenses: items.map((it) => ({
          state: it.state,
          ...(it.city ? { city: it.city } : {}),
          license: it.license,
          trade: it.trade,
        })),
      };
      const { data } = await this.http.post<BackendBatchResponse>("/batch", body);
      return {
        summary: { total: data.total, succeeded: data.succeeded, failed: data.failed },
        results: data.results,
      };
    } catch (err: any) {
      throw this.wrapError(err);
    }
  }

  async search(
    state: string,
    name: string,
    trade: string,
    limit: number,
    city?: string
  ): Promise<SearchResponse> {
    try {
      const params: Record<string, string | number> = { state, name, trade, limit };
      if (city) params.city = city;
      const { data } = await this.http.get<SearchResponse>("/search", { params });
      return data;
    } catch (err: any) {
      throw this.wrapError(err);
    }
  }

  async health(): Promise<{ status: string; api: string; database: string; redis: string }> {
    try {
      const { data } = await this.http.get("/health");
      return data;
    } catch (err: any) {
      throw this.wrapError(err);
    }
  }

  async states(): Promise<StatesApiResponse> {
    try {
      const { data } = await this.http.get<StatesApiResponse>("/states");
      return data;
    } catch (err: any) {
      throw this.wrapError(err);
    }
  }

  private wrapError(err: any): ApiError {
    if (err.isAxiosError && err.response) {
      const { status, data, headers } = err.response;
      const detail = data?.detail ?? "Unknown error";

      if (status === 401) {
        return new ApiError(
          "Authentication failed — check your CLV_API_KEY environment variable",
          401
        );
      }
      if (status === 429) {
        const retryAfter = parseInt(headers?.["retry-after"] ?? "60", 10);
        return new ApiError(
          `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          429,
          retryAfter
        );
      }
      if (status === 400) {
        return new ApiError(detail, 400);
      }
      if (status === 502) {
        return new ApiError(
          "Verification temporarily unavailable. Try again in a few minutes.",
          502
        );
      }
      return new ApiError(detail, status);
    }

    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
      return new ApiError(
        "Cannot reach the verification API — check your CLV_API_URL environment variable",
        0
      );
    }

    return new ApiError(err.message ?? "Unknown error", 0);
  }
}

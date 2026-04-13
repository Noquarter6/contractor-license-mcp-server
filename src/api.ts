import axios, { AxiosInstance } from "axios";
import type { LicenseResult, SearchResponse } from "./types.js";

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

  constructor(baseURL: string, apiKey: string) {
    this.http = axios.create({
      baseURL,
      headers: { "X-API-Key": apiKey },
      timeout: 120_000, // Portal lookups can be slow
    });
  }

  async verify(
    state: string,
    licenseNumber: string,
    trade: string
  ): Promise<LicenseResult> {
    try {
      const { data } = await this.http.get<LicenseResult>("/verify", {
        params: { state, license: licenseNumber, trade },
      });
      return data;
    } catch (err: any) {
      throw this.wrapError(err);
    }
  }

  async search(
    state: string,
    name: string,
    trade: string,
    limit: number
  ): Promise<SearchResponse> {
    try {
      const { data } = await this.http.get<SearchResponse>("/search", {
        params: { state, name, trade, limit },
      });
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

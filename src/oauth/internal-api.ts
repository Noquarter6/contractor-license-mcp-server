import axios from "axios";

const API_URL = process.env.CLV_API_URL ?? "http://127.0.0.1:8000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "";

export interface RegisteredClient {
  client_id: string;
  client_name: string | null;
  redirect_uris: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
  client_secret: string | null;
  client_secret_expires_at: number | null;
  client_id_issued_at: number;
}

export interface UserInfo {
  api_key_id: string;
  email: string;
}

const http = axios.create({
  baseURL: API_URL,
  timeout: 10_000,
  headers: { "X-Internal-Secret": INTERNAL_SECRET },
});

export async function registerClientRemote(
  req: Omit<RegisteredClient, "client_id" | "client_id_issued_at" | "client_secret_expires_at" | "client_secret">,
): Promise<RegisteredClient> {
  if (!INTERNAL_SECRET) throw new Error("INTERNAL_SECRET not configured");
  const { data } = await http.post<RegisteredClient>("/internal/oauth/clients", req);
  return data;
}

export async function getClientRemote(clientId: string): Promise<RegisteredClient | null> {
  if (!INTERNAL_SECRET) throw new Error("INTERNAL_SECRET not configured");
  try {
    const { data } = await http.get<RegisteredClient>(
      `/internal/oauth/clients/${encodeURIComponent(clientId)}`,
    );
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

export async function getUserRemote(apiKeyId: string): Promise<UserInfo | null> {
  if (!INTERNAL_SECRET) throw new Error("INTERNAL_SECRET not configured");
  try {
    const { data } = await http.get<UserInfo>(
      `/internal/users/${encodeURIComponent(apiKeyId)}`,
    );
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

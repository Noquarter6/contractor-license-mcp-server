import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientsStore } from "../src/oauth/store.js";

vi.mock("../src/oauth/internal-api.js", () => ({
  registerClientRemote: vi.fn(),
  getClientRemote: vi.fn(),
}));

import {
  registerClientRemote,
  getClientRemote,
} from "../src/oauth/internal-api.js";

const mockRegister = registerClientRemote as ReturnType<typeof vi.fn>;
const mockGet = getClientRemote as ReturnType<typeof vi.fn>;

describe("ClientsStore", () => {
  beforeEach(() => {
    mockRegister.mockReset();
    mockGet.mockReset();
  });

  it("getClient returns the client when found", async () => {
    mockGet.mockResolvedValue({
      client_id: "abc",
      client_name: "Claude Desktop",
      redirect_uris: ["http://localhost:9999/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
      client_secret: null,
      client_secret_expires_at: null,
      client_id_issued_at: 1700000000,
    });
    const store = new ClientsStore();
    const result = await store.getClient("abc");
    expect(result?.client_id).toBe("abc");
    expect(result?.redirect_uris).toEqual(["http://localhost:9999/callback"]);
    expect(mockGet).toHaveBeenCalledWith("abc");
  });

  it("getClient returns undefined when not found", async () => {
    mockGet.mockResolvedValue(null);
    const store = new ClientsStore();
    expect(await store.getClient("missing")).toBeUndefined();
  });

  it("registerClient proxies to FastAPI + returns full client record", async () => {
    mockRegister.mockResolvedValue({
      client_id: "new-id",
      client_name: "Test",
      redirect_uris: ["http://localhost:9999/callback"],
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "none",
      client_secret: null,
      client_secret_expires_at: null,
      client_id_issued_at: 1700000000,
    });
    const store = new ClientsStore();
    const result = await store.registerClient({
      client_name: "Test",
      redirect_uris: ["http://localhost:9999/callback"],
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "none",
    });
    expect(result.client_id).toBe("new-id");
    expect(mockRegister).toHaveBeenCalledWith({
      client_name: "Test",
      redirect_uris: ["http://localhost:9999/callback"],
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "none",
    });
  });
});

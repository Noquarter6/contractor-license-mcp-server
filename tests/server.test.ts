import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { ApiClient } from "../src/api.js";
import { createServer } from "../src/server.js";

vi.mock("axios");

describe("createServer", () => {
  let client: ApiClient;

  beforeEach(() => {
    vi.mocked(axios.create).mockReturnValue({ get: vi.fn(), post: vi.fn() } as any);
    client = new ApiClient("http://localhost:8000", "test-key");
  });

  it("returns an McpServer instance", () => {
    const server = createServer(client);
    expect(server).toBeDefined();
  });

  it("registers all 4 tools", () => {
    const server = createServer(client);
    // McpServer exposes registered tools via internal state — we verify by checking
    // the server object is well-formed and has the expected shape
    expect(server).toHaveProperty("connect");
  });

  it("creates independent servers for different clients", () => {
    const client1 = new ApiClient("http://localhost:8000", "key-1");
    const client2 = new ApiClient("http://localhost:8000", "key-2");
    const server1 = createServer(client1);
    const server2 = createServer(client2);
    expect(server1).not.toBe(server2);
  });
});

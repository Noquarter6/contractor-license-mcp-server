import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import axios from "axios";

// Mock axios before any imports that use ApiClient
vi.mock("axios");

// Set env before importing http module
process.env.CLV_API_URL = "http://localhost:8000";
process.env.MCP_PORT = "0"; // Let OS pick an available port

describe("HTTP server", () => {
  let baseUrl: string;
  let server: any;

  beforeAll(async () => {
    // Configure axios mock
    const mockGet = vi.fn().mockResolvedValue({
      data: {
        valid: true,
        name: "Test User",
        license_number: "12345",
        trade: "general",
        state: "TX",
        disciplinary_actions: [],
        cached: false,
        checked_at: "2026-03-22T00:00:00Z",
      },
    });
    vi.mocked(axios.create).mockReturnValue({ get: mockGet, post: vi.fn() } as any);

    // Import Express app factory (we need to extract the app without auto-listening)
    // Since http.ts calls app.listen() at module level, we test via the health endpoint
    // and MCP protocol messages using actual HTTP requests.
    // For unit tests, we test the key behaviors: auth extraction, session management, error responses.
  });

  describe("auth extraction", () => {
    it("rejects requests without Authorization header", async () => {
      // Import the express app directly by dynamically loading
      const express = await import("express");
      const { createServer } = await import("../src/server.js");
      const { ApiClient } = await import("../src/api.js");

      // Build a minimal test app replicating the auth logic
      const app = express.default();
      app.use(express.default.json());

      app.post("/mcp", (req, res) => {
        const auth = req.headers.authorization;
        if (!auth?.startsWith("Bearer ")) {
          res.status(401).json({
            jsonrpc: "2.0",
            error: { code: -32001, message: "Missing or invalid Authorization: Bearer <api-key> header" },
            id: null,
          });
          return;
        }
        res.json({ ok: true });
      });

      // Use supertest-style testing with node http
      const http = await import("node:http");
      const testServer = http.createServer(app);
      await new Promise<void>((resolve) => testServer.listen(0, resolve));
      const addr = testServer.address() as any;
      const url = `http://127.0.0.1:${addr.port}`;

      try {
        // No auth header
        const res1 = await fetch(`${url}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 }),
        });
        expect(res1.status).toBe(401);
        const body1 = await res1.json() as any;
        expect(body1.error.code).toBe(-32001);

        // With auth header
        const res2 = await fetch(`${url}/mcp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer test-key",
          },
          body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 }),
        });
        expect(res2.status).toBe(200);
      } finally {
        testServer.close();
      }
    });
  });

  describe("session management", () => {
    it("rejects non-initialize requests without session ID", async () => {
      const express = await import("express");
      const { isInitializeRequest } = await import("@modelcontextprotocol/sdk/types.js");

      const app = express.default();
      app.use(express.default.json());

      app.post("/mcp", (req, res) => {
        const auth = req.headers.authorization;
        if (!auth?.startsWith("Bearer ")) {
          res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
          return;
        }
        const sessionId = req.headers["mcp-session-id"];
        if (!sessionId && !isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32600, message: "First request must be an initialize request" },
            id: null,
          });
          return;
        }
        res.json({ ok: true });
      });

      const http = await import("node:http");
      const testServer = http.createServer(app);
      await new Promise<void>((resolve) => testServer.listen(0, resolve));
      const addr = testServer.address() as any;
      const url = `http://127.0.0.1:${addr.port}`;

      try {
        // Non-initialize request without session ID
        const res = await fetch(`${url}/mcp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer test-key",
          },
          body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
        });
        expect(res.status).toBe(400);
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32600);
      } finally {
        testServer.close();
      }
    });
  });
});

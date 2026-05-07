import express from "express";
import cookieParser from "cookie-parser";
import { createHash, randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
// Import requireBearerAuth solely to load its module augmentation:
//   declare module 'express-serve-static-core' { interface Request { auth?: AuthInfo; } }
// The SDK's router.js does not transitively import bearerAuth.js, so without
// this import the compiler does not know about req.auth.
import type {} from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { ApiClient } from "./api.js";
import { createServer } from "./server.js";
import { OAuthProvider } from "./oauth/provider.js";
import { oauthCallbackRouter } from "./oauth/callback.js";
import { verifyAccessToken, looksLikeJwt } from "./oauth/jwt.js";

const API_URL = process.env.CLV_API_URL ?? "http://127.0.0.1:8000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "";
const PORT = parseInt(process.env.MCP_PORT ?? "3001", 10);
const ISSUER = process.env.OAUTH_ISSUER ?? "https://www.tradesapi.com";
const RESOURCE = process.env.OAUTH_RESOURCE ?? "https://www.tradesapi.com/mcp";
const BASE_URL = process.env.OAUTH_BASE_URL ?? "https://www.tradesapi.com";

const SESSION_TTL_MS = 30 * 60 * 1000;
const REAP_INTERVAL_MS = 60 * 1000;

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
  /** Identity this session was bound to at init time.
   *  For JWT-authenticated sessions: the apiKeyId (JWT `sub` claim).
   *  For raw-key sessions: sha256 of the raw token.
   *  Compared against the auth result on every subsequent request —
   *  a mismatch means the Mcp-Session-Id was used by a different identity,
   *  which we reject with 403 to prevent cross-account session hijack.
   */
  identity: string;
}
const sessions = new Map<string, SessionEntry>();

function touchSession(sessionId: string): void {
  const entry = sessions.get(sessionId);
  if (entry) entry.lastActivity = Date.now();
}

// Keep a handle so future graceful-shutdown logic can clearInterval(reaper).
const reaper = setInterval(() => {
  const now = Date.now();
  for (const [sid, entry] of sessions) {
    if (now - entry.lastActivity > SESSION_TTL_MS) {
      entry.transport.close?.();
      sessions.delete(sid);
    }
  }
}, REAP_INTERVAL_MS);
void reaper;

// Fail-fast if critical OAuth env vars are missing/weak in production.
// FastAPI hard-fails on INTERNAL_SECRET < 32 chars and on every
// JWT_SECRET rotation key < 32 chars; mirror both checks here so a
// misconfigured deploy crashes at boot rather than minting weak tokens
// or 401ing silently.
if (process.env.NODE_ENV === "production") {
  if (!INTERNAL_SECRET || INTERNAL_SECRET.length < 32) {
    console.error("FATAL: INTERNAL_SECRET must be set and >= 32 characters in production");
    process.exit(1);
  }
  const jwtKeys = (process.env.JWT_SECRET ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (jwtKeys.length === 0) {
    console.error("FATAL: JWT_SECRET must be set in production");
    process.exit(1);
  }
  for (const k of jwtKeys) {
    if (k.length < 32) {
      console.error(
        "FATAL: every JWT_SECRET rotation key must be >= 32 characters in production",
      );
      process.exit(1);
    }
  }
}

const app = express();
const oauthProvider = new OAuthProvider();

app.use(cookieParser());

// Expose Mcp-Session-Id header to browsers (existing behavior)
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  next();
});

// ── OAuth endpoints (root-mounted) ─────────────────────────────────────────
// mcpAuthRouter handles /authorize, /token, /register, /revoke, /.well-known/*
app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: new URL(ISSUER),
    baseUrl: new URL(BASE_URL),
    resourceServerUrl: new URL(RESOURCE),
    scopesSupported: ["mcp:tools"],
    resourceName: "TradesAPI Contractor License Verification",
  }),
);
// Custom routes not handled by the SDK
app.use(oauthCallbackRouter(oauthProvider));

// JSON body parser for /mcp endpoint (AFTER OAuth; token/register need urlencoded)
app.use(express.json());

// ── Auth for /mcp ──────────────────────────────────────────────────────────

export interface AuthResult {
  /** api_key_id when authenticated via JWT, or undefined when authenticated via raw API key */
  apiKeyId?: string;
  /** Raw token (either JWT or raw API key) — used to build ApiClient */
  token: string;
  /** True if this was a JWT (and therefore Node uses X-Internal-Secret + X-Api-Key-Id when calling FastAPI) */
  isJwt: boolean;
}

function extractBearer(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function sendUnauthorized(res: express.Response, reason: string): void {
  const resourceMeta = `${BASE_URL}/.well-known/oauth-protected-resource/mcp`;
  res.setHeader(
    "WWW-Authenticate",
    `Bearer resource_metadata="${resourceMeta}", error="invalid_token", error_description="${reason}"`,
  );
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: reason },
    id: null,
  });
}

async function requireAuth(
  req: express.Request,
  res: express.Response,
): Promise<AuthResult | null> {
  const token = extractBearer(req);
  if (!token) {
    sendUnauthorized(res, "Missing Authorization: Bearer <token>");
    return null;
  }

  if (looksLikeJwt(token)) {
    try {
      // ── DEVIATION: pass ISSUER as 3rd arg (design doc requires iss check;
      // same fix as Task 9 where jwt.ts's expectedIssuer param was added).
      const info = await verifyAccessToken(token, RESOURCE, ISSUER);
      // `sub` is always set by _mintPair (Task 9). Fail loud if it isn't —
      // falling back to info.clientId would silently promote the OAuth client
      // (Claude Desktop etc.) into FastAPI's X-Api-Key-Id position.
      const apiKeyId = info.extra?.sub as string | undefined;
      if (!apiKeyId) {
        sendUnauthorized(res, "Invalid or expired access token");
        return null;
      }
      req.auth = info;
      return { apiKeyId, token, isJwt: true };
    } catch {
      // ── DEVIATION: drop `err: any` (tsconfig strict — same fix as Task 6
      // review). We log nothing here; the WWW-Authenticate error_description
      // is the user-visible signal. jwt.ts already sanitizes leaked claims.
      sendUnauthorized(res, "Invalid or expired access token");
      return null;
    }
  }

  // Raw API key — pass through as before
  return { token, isJwt: false };
}

function buildApiClient(auth: AuthResult): ApiClient {
  if (auth.isJwt && auth.apiKeyId) {
    // JWT-authenticated: use internal headers
    return new ApiClient(API_URL, "", {
      "X-Internal-Secret": INTERNAL_SECRET,
      "X-Api-Key-Id": auth.apiKeyId,
    });
  }
  // Raw API key
  return new ApiClient(API_URL, auth.token);
}

export function sessionIdentity(auth: AuthResult): string {
  if (auth.isJwt && auth.apiKeyId) return auth.apiKeyId;
  return createHash("sha256").update(auth.token).digest("hex");
}

// ── MCP endpoint (POST / GET / DELETE) ─────────────────────────────────────

app.post("/mcp", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId) {
    const entry = sessions.get(sessionId);
    if (!entry) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Session not found. Send an initialize request to start a new session." },
        id: null,
      });
      return;
    }
    // Reject cross-account session hijack: the bearer token's identity must
    // match the identity the session was initialized with.
    if (entry.identity !== sessionIdentity(auth)) {
      res.status(403).json({
        jsonrpc: "2.0",
        error: { code: -32002, message: "Session does not match authenticated identity" },
        id: null,
      });
      return;
    }
    touchSession(sessionId);
    await entry.transport.handleRequest(req, res, req.body);
    return;
  }

  if (!isInitializeRequest(req.body)) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32600, message: "First request must be an initialize request (no Mcp-Session-Id header found)" },
      id: null,
    });
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      sessions.set(sid, {
        transport,
        lastActivity: Date.now(),
        identity: sessionIdentity(auth),
      });
    },
  });
  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) sessions.delete(sid);
  };

  const client = buildApiClient(auth);
  const server = createServer(client);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Mcp-Session-Id header required for SSE stream" },
      id: null,
    });
    return;
  }
  const entry = sessions.get(sessionId);
  if (!entry) {
    res.status(404).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Session not found" },
      id: null,
    });
    return;
  }
  // Reject cross-account session hijack: the bearer token's identity must
  // match the identity the session was initialized with.
  if (entry.identity !== sessionIdentity(auth)) {
    res.status(403).json({
      jsonrpc: "2.0",
      error: { code: -32002, message: "Session does not match authenticated identity" },
      id: null,
    });
    return;
  }
  touchSession(sessionId);
  await entry.transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Mcp-Session-Id header required" }, id: null });
    return;
  }
  const entry = sessions.get(sessionId);
  if (!entry) {
    res.status(404).json({ jsonrpc: "2.0", error: { code: -32000, message: "Session not found" }, id: null });
    return;
  }
  // Reject cross-account session hijack: the bearer token's identity must
  // match the identity the session was initialized with.
  if (entry.identity !== sessionIdentity(auth)) {
    res.status(403).json({
      jsonrpc: "2.0",
      error: { code: -32002, message: "Session does not match authenticated identity" },
      id: null,
    });
    return;
  }
  await entry.transport.handleRequest(req, res);
});

app.get("/mcp/health", (_req, res) => {
  res.json({ status: "ok", sessions: sessions.size });
});

app.listen(PORT, () => {
  console.log(`MCP HTTP server listening on port ${PORT}`);
  console.log(`API backend: ${API_URL}`);
  console.log(`OAuth issuer: ${ISSUER}`);
});

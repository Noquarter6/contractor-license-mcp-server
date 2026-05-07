// mcp-server/src/oauth/callback.ts
import type { Request, Response, Router } from "express";
import express from "express";
import { randomBytes } from "node:crypto";
import { getRedis, getdel } from "../redis.js";
import { OAuthProvider } from "./provider.js";
import { renderConsent } from "./consent.js";

const OAUTH_REF_TTL = 600;

export function oauthCallbackRouter(provider: OAuthProvider): Router {
  const router = express.Router();
  const clientsStore = provider.clientsStore;

  // GET /oauth/authorize/callback?oauth_ref=...
  // Called from FastAPI's post-login redirect.
  router.get("/oauth/authorize/callback", async (req: Request, res: Response) => {
    const oauthRef = req.query.oauth_ref as string | undefined;
    if (!oauthRef) {
      res.status(400).send("Missing oauth_ref");
      return;
    }

    const raw = await getdel(`oauth_ref:${oauthRef}`);
    if (!raw) {
      res.status(400).send("oauth_ref expired or invalid — please start the authorization flow again");
      return;
    }
    const pending = JSON.parse(raw) as {
      client_id: string;
      redirect_uri: string;
      scope: string;
      code_challenge: string;
      code_challenge_method: "S256";
      state?: string;
      resource?: string;
    };

    const sessionId = (req as any).cookies?.session_id as string | undefined;
    if (!sessionId) {
      res.status(401).send("Session cookie missing — login did not complete");
      return;
    }
    const sessRaw = await getRedis().get(`session:${sessionId}`);
    if (!sessRaw) {
      res.status(401).send("Session expired");
      return;
    }
    const session = JSON.parse(sessRaw) as { api_key_id: string; email: string };

    const client = await clientsStore.getClient(pending.client_id);
    if (!client) {
      res.status(400).send("Unknown client");
      return;
    }

    const consentToken = randomBytes(24).toString("hex");
    await getRedis().setex(
      `oauth_consent:${consentToken}`,
      OAUTH_REF_TTL,
      JSON.stringify({ ...pending, api_key_id: session.api_key_id }),
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(
      renderConsent({
        client,
        scope: pending.scope,
        consentToken,
        userEmail: session.email,
        redirectUri: pending.redirect_uri,
      }),
    );
  });

  // POST /oauth/consent (form-urlencoded: consent_token, decision=allow|deny)
  router.post(
    "/oauth/consent",
    express.urlencoded({ extended: false }),
    async (req: Request, res: Response) => {
      const consentToken = (req.body.consent_token ?? "") as string;
      const decision = (req.body.decision ?? "") as string;
      if (!consentToken) {
        res.status(400).send("Missing consent_token");
        return;
      }

      const raw = await getRedis().get(`oauth_consent:${consentToken}`);
      if (!raw) {
        res.status(400).send("Consent token expired or invalid");
        return;
      }
      const pending = JSON.parse(raw) as {
        client_id: string;
        redirect_uri: string;
        scope: string;
        code_challenge: string;
        code_challenge_method: "S256";
        state?: string;
        resource?: string;
        api_key_id: string;
      };

      // ── DEVIATION FROM PLAN: bind consent submission to session ──
      // Without this check, anyone holding a leaked consent_token (browser
      // history, screenshot, log, back-channel) could POST it and trigger
      // an auth code redirect to the client's callback. The legit user
      // never intended to authorize. Verify the active session matches the
      // session that was logged in when consent was issued.
      const sessionId = (req as any).cookies?.session_id as string | undefined;
      if (!sessionId) {
        res.status(401).send("Session cookie missing");
        return;
      }
      const sessRaw = await getRedis().get(`session:${sessionId}`);
      if (!sessRaw) {
        res.status(401).send("Session expired");
        return;
      }
      const session = JSON.parse(sessRaw) as { api_key_id: string; email: string };
      if (session.api_key_id !== pending.api_key_id) {
        // Burn the consent token to prevent replay
        await getRedis().del(`oauth_consent:${consentToken}`);
        res.status(403).send("Session does not match consent context");
        return;
      }
      // ── end deviation ──

      if (decision !== "allow") {
        await getRedis().del(`oauth_consent:${consentToken}`);
        // Safe redirect: pending.redirect_uri was validated against the client's
        // registered redirect_uris by mcpAuthRouter before /authorize stashed it.
        const url = new URL(pending.redirect_uri);
        url.searchParams.set("error", "access_denied");
        if (pending.state) url.searchParams.set("state", pending.state);
        res.redirect(302, url.toString());
        return;
      }

      const { redirect } = await provider.issueCodeFromConsent(consentToken);
      res.redirect(302, redirect);
    },
  );

  return router;
}

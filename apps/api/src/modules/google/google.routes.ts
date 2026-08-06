import { Router } from "express";
import { z } from "zod";

import { env } from "../../config/env.js";
import type { GoogleSheetsClient } from "../sheets/google-sheets.client.js";
import type { GoogleOAuthService } from "./google-oauth.service.js";

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const createGoogleRouter = (
  oauth: GoogleOAuthService,
  sheets: GoogleSheetsClient,
  prepareContract?: () => Promise<unknown>,
) => {
  const router = Router();

  router.get("/status", async (_request, response) => {
    response.json({ data: await oauth.status() });
  });

  router.get("/auth-url", (_request, response) => {
    response.json({ data: { authUrl: oauth.authUrl() } });
  });

  router.get("/callback", async (request, response) => {
    const query = callbackQuerySchema.parse(request.query);
    await oauth.handleCallback(query.code, query.state);
    response.redirect(`${env.FRONTEND_URL}/settings?google=connected`);
  });

  router.post("/disconnect", async (_request, response) => {
    await oauth.disconnect();
    response.json({ data: { connected: false } });
  });

  router.post("/test", async (_request, response) => {
    await prepareContract?.();
    response.json({ data: await sheets.testConnection() });
  });

  return router;
};

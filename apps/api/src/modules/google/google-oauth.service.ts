import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";
import type { GoogleTokenSet, TokenStore } from "./google-token-store.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const STATE_TTL_MS = 10 * 60 * 1000;

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().positive(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

const requireOAuthConfiguration = () => {
  const missing = [
    ["GOOGLE_CLIENT_ID", env.GOOGLE_CLIENT_ID],
    ["GOOGLE_CLIENT_SECRET", env.GOOGLE_CLIENT_SECRET],
    ["SESSION_SECRET", env.SESSION_SECRET.length >= 32 ? "ok" : ""],
    ["TOKEN_ENCRYPTION_KEY", env.TOKEN_ENCRYPTION_KEY.length >= 32 ? "ok" : ""],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new AppError(
      503,
      "GOOGLE_NOT_CONFIGURED",
      "Google OAuth is not configured",
      {
        missing,
      },
    );
  }
};

const stateSignature = (payload: string) =>
  createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url");

const createState = () => {
  const payload = Buffer.from(
    JSON.stringify({
      issuedAt: Date.now(),
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  return `${payload}.${stateSignature(payload)}`;
};

const verifyState = (state: string) => {
  const [payload, suppliedSignature] = state.split(".");
  if (!payload || !suppliedSignature) return false;

  const expected = Buffer.from(stateSignature(payload));
  const supplied = Buffer.from(suppliedSignature);
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return false;
  }

  try {
    const parsed = z
      .object({ issuedAt: z.number(), nonce: z.string() })
      .parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return Date.now() - parsed.issuedAt <= STATE_TTL_MS;
  } catch {
    return false;
  }
};

export class GoogleOAuthService {
  constructor(private readonly tokenStore: TokenStore) {}

  configurationStatus() {
    const fields = {
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
      MASTER_SPREADSHEET_ID: env.MASTER_SPREADSHEET_ID,
      ORDERS_SPREADSHEET_ID: env.ORDERS_SPREADSHEET_ID,
      SESSION_SECRET: env.SESSION_SECRET.length >= 32 ? "configured" : "",
      TOKEN_ENCRYPTION_KEY:
        env.TOKEN_ENCRYPTION_KEY.length >= 32 ? "configured" : "",
    };
    const missingConfiguration = Object.entries(fields)
      .filter(([, value]) => !value)
      .map(([key]) => key);
    return {
      configured: missingConfiguration.length === 0,
      missingConfiguration,
    };
  }

  async status() {
    const configuration = this.configurationStatus();
    return { ...configuration, connected: await this.tokenStore.exists() };
  }

  authUrl() {
    requireOAuthConfiguration();
    const query = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: SHEETS_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: createState(),
    });
    return `${GOOGLE_AUTH_URL}?${query.toString()}`;
  }

  async handleCallback(code: string, state: string) {
    requireOAuthConfiguration();
    if (!verifyState(state)) {
      throw new AppError(
        400,
        "INVALID_OAUTH_STATE",
        "OAuth state is invalid or expired",
      );
    }

    const tokens = await this.exchangeToken({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    });
    if (!tokens.refresh_token) {
      throw new AppError(
        400,
        "MISSING_REFRESH_TOKEN",
        "Google did not return a refresh token; revoke app access and connect again",
      );
    }
    await this.tokenStore.write(this.toTokenSet(tokens, tokens.refresh_token));
  }

  async disconnect() {
    await this.tokenStore.delete();
  }

  async getAccessToken() {
    requireOAuthConfiguration();
    const saved = await this.tokenStore.read();
    if (!saved) {
      throw new AppError(
        401,
        "GOOGLE_NOT_CONNECTED",
        "Connect Google Sheets first",
      );
    }
    if (
      saved.accessToken &&
      saved.expiresAt &&
      saved.expiresAt > Date.now() + 60_000
    ) {
      return saved.accessToken;
    }

    const refreshed = await this.exchangeToken({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: saved.refreshToken,
      grant_type: "refresh_token",
    });
    const next = this.toTokenSet(refreshed, saved.refreshToken);
    await this.tokenStore.write(next);
    return next.accessToken!;
  }

  private toTokenSet(
    response: z.infer<typeof tokenResponseSchema>,
    refreshToken: string,
  ): GoogleTokenSet {
    return {
      accessToken: response.access_token,
      refreshToken,
      expiresAt: Date.now() + response.expires_in * 1000,
      ...(response.scope ? { scope: response.scope } : {}),
      ...(response.token_type ? { tokenType: response.token_type } : {}),
    };
  }

  private async exchangeToken(fields: Record<string, string>) {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      throw new AppError(
        502,
        "GOOGLE_OAUTH_FAILED",
        "Google OAuth request failed",
      );
    }
    return tokenResponseSchema.parse(body);
  }
}

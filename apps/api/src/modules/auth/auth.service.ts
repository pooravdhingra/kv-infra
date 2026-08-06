import {
  authRoleSchema,
  loginRequestSchema,
  type AuthRole,
} from "@kv-infra/shared";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { env } from "../../config/env.js";
import { AppError } from "../../lib/app-error.js";

export const AUTH_COOKIE_NAME = "kv_session";

const sessionPayloadSchema = z.object({
  role: authRoleSchema,
  expiresAt: z.number().int().positive(),
});

type SessionPayload = z.infer<typeof sessionPayloadSchema>;

type AuthConfiguration = {
  operatorPassword: string;
  ownerPassword: string;
  sessionSecret: string;
  sessionHours: number;
  secureCookies: boolean;
};

const digest = (value: string) => createHash("sha256").update(value).digest();

const safeEqual = (left: string, right: string) =>
  timingSafeEqual(digest(left), digest(right));

export const shouldUseSecureCookies = (appBaseUrl: string) =>
  new URL(appBaseUrl).protocol === "https:";

const cookieValue = (rawCookie: string | undefined, name: string) =>
  (rawCookie ?? "")
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)
    ?.slice(1)
    .join("=");

export class AuthService {
  private readonly failedAttempts = new Map<
    string,
    { count: number; lockedUntil: number }
  >();

  constructor(
    private readonly config: AuthConfiguration = {
      operatorPassword: env.OPERATOR_PASSWORD,
      ownerPassword: env.OWNER_PASSWORD || env.OPERATOR_PASSWORD,
      sessionSecret: env.SESSION_SECRET,
      sessionHours: env.AUTH_SESSION_HOURS,
      secureCookies: shouldUseSecureCookies(env.APP_BASE_URL),
    },
  ) {}

  login(input: unknown, attemptKey = "global") {
    this.assertConfigured();
    const attempt = this.failedAttempts.get(attemptKey);
    if (attempt && attempt.lockedUntil > Date.now()) {
      throw new AppError(
        429,
        "LOGIN_TEMPORARILY_LOCKED",
        "Too many incorrect attempts. Try again in five minutes",
      );
    }
    const request = loginRequestSchema.parse(input);
    const expected =
      request.role === "OWNER"
        ? this.config.ownerPassword
        : this.config.operatorPassword;
    if (!safeEqual(request.password, expected)) {
      const count = (attempt?.count ?? 0) + 1;
      this.failedAttempts.set(attemptKey, {
        count: count >= 5 ? 0 : count,
        lockedUntil: count >= 5 ? Date.now() + 5 * 60 * 1_000 : 0,
      });
      throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect password");
    }
    this.failedAttempts.delete(attemptKey);
    const payload: SessionPayload = {
      role: request.role,
      expiresAt: Date.now() + this.config.sessionHours * 60 * 60 * 1_000,
    };
    return {
      session: { authenticated: true as const, role: payload.role },
      cookie: this.sessionCookie(this.sign(payload)),
    };
  }

  session(rawCookie: string | undefined) {
    const token = cookieValue(rawCookie, AUTH_COOKIE_NAME);
    const payload = token ? this.verify(token) : null;
    return payload
      ? { authenticated: true as const, role: payload.role }
      : { authenticated: false as const, role: null };
  }

  requireSession(rawCookie: string | undefined) {
    const session = this.session(rawCookie);
    if (!session.authenticated) {
      throw new AppError(401, "AUTH_REQUIRED", "Sign in to continue");
    }
    return session;
  }

  clearCookie() {
    return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.config.secureCookies ? "; Secure" : ""}`;
  }

  private assertConfigured() {
    if (
      this.config.operatorPassword.length < 8 ||
      this.config.ownerPassword.length < 8 ||
      this.config.sessionSecret.length < 32
    ) {
      throw new AppError(
        503,
        "AUTH_NOT_CONFIGURED",
        "Authentication secrets are not configured",
      );
    }
  }

  private sign(payload: SessionPayload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", this.config.sessionSecret)
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${signature}`;
  }

  private verify(token: string) {
    this.assertConfigured();
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) return null;
    const expected = createHmac("sha256", this.config.sessionSecret)
      .update(encoded)
      .digest("base64url");
    if (!safeEqual(signature, expected)) return null;
    try {
      const payload = sessionPayloadSchema.parse(
        JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
      );
      return payload.expiresAt > Date.now() ? payload : null;
    } catch {
      return null;
    }
  }

  private sessionCookie(token: string) {
    const maxAge = this.config.sessionHours * 60 * 60;
    return `${AUTH_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.config.secureCookies ? "; Secure" : ""}`;
  }
}

export type AuthenticatedSession = {
  authenticated: true;
  role: AuthRole;
};

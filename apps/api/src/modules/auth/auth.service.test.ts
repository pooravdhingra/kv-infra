import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../lib/app-error.js";
import { AuthService } from "./auth.service.js";
import { requireAuthentication } from "./auth.routes.js";

const service = () =>
  new AuthService({
    operatorPassword: "operator-secret",
    ownerPassword: "owner-secret",
    sessionSecret: "a-session-secret-that-is-at-least-32-characters",
    sessionHours: 12,
    secureCookies: false,
  });

describe("AuthService", () => {
  it("creates and verifies separate role sessions", () => {
    const auth = service();
    const operator = auth.login({
      role: "OPERATOR",
      password: "operator-secret",
    });
    const owner = auth.login({ role: "OWNER", password: "owner-secret" });

    expect(auth.session(operator.cookie)).toEqual({
      authenticated: true,
      role: "OPERATOR",
    });
    expect(auth.session(owner.cookie)).toEqual({
      authenticated: true,
      role: "OWNER",
    });
    expect(operator.cookie).toContain("HttpOnly");
    expect(operator.cookie).toContain("SameSite=Lax");
  });

  it("rejects an incorrect password without creating a session", () => {
    expect(() =>
      service().login({ role: "OPERATOR", password: "wrong-password" }),
    ).toThrowError(AppError);
  });

  it("rejects a modified session cookie", () => {
    const auth = service();
    const result = auth.login({
      role: "OPERATOR",
      password: "operator-secret",
    });
    const [cookie] = result.cookie.split(";");
    const [name, token] = cookie!.split("=");
    expect(auth.session(`${name}=${token}changed`)).toEqual({
      authenticated: false,
      role: null,
    });
  });

  it("temporarily locks repeated incorrect attempts", () => {
    const auth = service();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() =>
        auth.login(
          { role: "OPERATOR", password: "wrong-password" },
          "test-client",
        ),
      ).toThrowError(AppError);
    }
    expect(() =>
      auth.login(
        { role: "OPERATOR", password: "operator-secret" },
        "test-client",
      ),
    ).toThrowError(/five minutes/);
  });

  it("blocks protected routes without a signed cookie", () => {
    const next = vi.fn();
    requireAuthentication(service())(
      { headers: {} } as Request,
      { locals: {} } as Response,
      next as NextFunction,
    );
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "AUTH_REQUIRED", status: 401 }),
    );
  });
});

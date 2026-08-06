import type { AuthSession } from "@kv-infra/shared";
import { describe, expect, it } from "vitest";

import {
  isAuthSessionExpired,
  resolveInitialAuthSession,
} from "./auth-session";

describe("resolveInitialAuthSession", () => {
  it("does not let a stale startup response overwrite a successful login", () => {
    const authenticated: AuthSession = {
      authenticated: true,
      role: "OPERATOR",
    };

    expect(
      resolveInitialAuthSession(authenticated, {
        authenticated: false,
        role: null,
      }),
    ).toBe(authenticated);
  });

  it("uses the startup response before an authentication action", () => {
    const initial: AuthSession = { authenticated: false, role: null };

    expect(resolveInitialAuthSession(null, initial)).toBe(initial);
  });

  it("only expires the operator session for the app auth error code", () => {
    expect(isAuthSessionExpired(401, "AUTH_REQUIRED", "/dashboard")).toBe(true);
    expect(
      isAuthSessionExpired(401, "GOOGLE_NOT_CONNECTED", "/dashboard"),
    ).toBe(false);
    expect(isAuthSessionExpired(401, "AUTH_REQUIRED", "/auth/login")).toBe(
      false,
    );
  });
});

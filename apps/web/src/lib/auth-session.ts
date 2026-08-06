import type { AuthSession } from "@kv-infra/shared";

export const resolveInitialAuthSession = (
  current: AuthSession | null,
  initial: AuthSession,
) => (current?.authenticated ? current : initial);

export const isAuthSessionExpired = (
  status: number | undefined,
  responseCode: string | undefined,
  requestUrl: string,
) =>
  status === 401 &&
  responseCode === "AUTH_REQUIRED" &&
  !requestUrl.includes("/auth/login") &&
  !requestUrl.includes("/auth/session");

import { useState, type FormEvent } from "react";
import type { AuthRole, AuthSession } from "@kv-infra/shared";

import { apiErrorMessage, login } from "../api/client";

const roleDetails: Record<AuthRole, { title: string; marker: string }> = {
  OPERATOR: {
    title: "Operator",
    marker: "OP",
  },
  OWNER: {
    title: "Owner",
    marker: "OW",
  },
};

export const AuthPage = ({
  onAuthenticated,
}: {
  onAuthenticated: (session: AuthSession) => void;
}) => {
  const [role, setRole] = useState<AuthRole>("OPERATOR");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      onAuthenticated(await login(role, password));
    } catch (error) {
      setMessage(apiErrorMessage(error));
      setSaving(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-heading">
        <div className="auth-brand">
          <img src="/kv-logo.png" alt="" width="54" height="54" />
          <div>
            <span className="eyebrow">KV Infra</span>
            <strong>Operations OS</strong>
          </div>
        </div>
        <div className="auth-intro">
          <h1 id="auth-heading">Sign in</h1>
        </div>
        <div
          className="auth-role-grid"
          role="radiogroup"
          aria-label="Access profile"
        >
          {(["OPERATOR", "OWNER"] as const).map((option) => {
            const details = roleDetails[option];
            return (
              <button
                type="button"
                role="radio"
                aria-checked={role === option}
                className={`auth-role ${role === option ? "is-selected" : ""}`}
                onClick={() => {
                  setRole(option);
                  setPassword("");
                  setMessage("");
                }}
                key={option}
              >
                <span>{details.marker}</span>
                <strong>{details.title}</strong>
              </button>
            );
          })}
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            {roleDetails[role].title} password
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {message && <div className="notice error-notice">{message}</div>}
          <button
            className="primary-button auth-submit"
            aria-busy={saving}
            disabled={saving || !password}
          >
            {saving ? "Signing in…" : `Sign in as ${roleDetails[role].title}`}
          </button>
        </form>
      </section>
    </main>
  );
};

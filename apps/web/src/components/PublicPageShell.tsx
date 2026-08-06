import type { PropsWithChildren } from "react";

export const PublicPageShell = ({
  children,
  label = "Order form",
}: PropsWithChildren<{ label?: string }>) => (
  <div className="public-shell">
    <header className="public-topbar">
      <div className="brand" aria-label="KV Operations OS">
        <img src="/kv-logo.png" alt="" width="40" height="40" />
        <span className="brand-copy">
          <span className="eyebrow">KV Infra</span>
          <strong>Operations OS</strong>
        </span>
      </div>
      <span className="public-form-label">{label}</span>
    </header>
    <main className="public-content">{children}</main>
  </div>
);

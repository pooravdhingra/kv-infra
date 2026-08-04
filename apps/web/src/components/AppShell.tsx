import { useEffect, useState, type PropsWithChildren } from "react";

import { getGoogleStatus, getWhatsAppStatus } from "../api/client";

const links = [
  ["/", "Home"],
  ["/skus", "SKU master"],
  ["/orders", "Orders"],
  ["/receiving", "Receive"],
  ["/packing", "Packing"],
  ["/inventory", "Inventory"],
  ["/supplier-requests", "Suppliers"],
  ["/settings", "Settings"],
] as const;

export const AppShell = ({ children }: PropsWithChildren) => {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    void getGoogleStatus()
      .then((status) => setConnected(status.connected))
      .catch(() => setConnected(false));
    const refreshWhatsApp = () =>
      void getWhatsAppStatus()
        .then((status) => setWhatsappConnected(status.connected))
        .catch(() => setWhatsappConnected(false));
    refreshWhatsApp();
    const timer = window.setInterval(refreshWhatsApp, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="KV Operations OS home">
          <img src="/kv-logo.png" alt="" width="40" height="40" />
          <span className="brand-copy">
            <span className="eyebrow">KV Infra</span>
            <strong>Operations OS</strong>
          </span>
        </a>
        <div className="connection-group">
          <a
            className={`connection ${connected ? "is-connected" : ""}`}
            href="/settings"
          >
            <i />{" "}
            {connected === null
              ? "Checking Google…"
              : connected
                ? "Sheets connected"
                : "Sheets offline"}
          </a>
          <a
            className={`connection ${whatsappConnected ? "is-connected" : ""}`}
            href="/settings"
          >
            <i />{" "}
            {whatsappConnected === null
              ? "Checking WhatsApp…"
              : whatsappConnected
                ? "WhatsApp connected"
                : "WhatsApp offline"}
          </a>
        </div>
      </header>
      <nav className="nav" aria-label="Main navigation">
        {links.map(([to, label]) => (
          <a
            key={to}
            href={to}
            className={
              to === "/orders" ||
              to === "/packing" ||
              to === "/supplier-requests"
                ? window.location.pathname.startsWith(to)
                  ? "active"
                  : ""
                : window.location.pathname === to
                  ? "active"
                  : ""
            }
          >
            {label}
          </a>
        ))}
      </nav>
      <main>{children}</main>
    </div>
  );
};

import type { PropsWithChildren } from "react";

const links = [
  ["/", "Home"],
  ["/orders/new", "New order"],
  ["/receiving", "Receive"],
  ["/packing", "Packing"],
  ["/inventory", "Inventory"],
] as const;

export const AppShell = ({ children }: PropsWithChildren) => (
  <div className="app-shell">
    <header className="topbar">
      <div>
        <span className="eyebrow">KV Infra</span>
        <strong>Operator OS</strong>
      </div>
      <span className="connection">
        <i /> API connected
      </span>
    </header>
    <nav className="nav" aria-label="Main navigation">
      {links.map(([to, label]) => (
        <a
          key={to}
          href={to}
          className={window.location.pathname === to ? "active" : ""}
        >
          {label}
        </a>
      ))}
    </nav>
    <main>{children}</main>
  </div>
);

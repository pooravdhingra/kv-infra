import { useEffect, useState } from "react";
import type { AuthSession } from "@kv-infra/shared";

import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { CreateOrderPage } from "./pages/CreateOrderPage";
import { InventoryDetailPage } from "./pages/InventoryDetailPage";
import { InventoryPage } from "./pages/InventoryPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrdersPage } from "./pages/OrdersPage";
import { PackingPage } from "./pages/PackingPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ReceivingPage } from "./pages/ReceivingPage";
import { StartPackingPage } from "./pages/StartPackingPage";
import { FinishPackingPage } from "./pages/FinishPackingPage";
import { SkuMasterPage } from "./pages/SkuMasterPage";
import { SupplierRequestsPage } from "./pages/SupplierRequestsPage";
import { NewSupplierRequestPage } from "./pages/NewSupplierRequestPage";
import { GroupSupplierRequestsPage } from "./pages/GroupSupplierRequestsPage";
import { AuthPage } from "./pages/AuthPage";
import { getAuthSession, logout } from "./api/client";
import { resolveInitialAuthSession } from "./lib/auth-session";
import { PublicOrderPage } from "./pages/PublicOrderPage";
import { PublicSkuPage } from "./pages/PublicSkuPage";
import { ClientOrderLinksPage } from "./pages/ClientOrderLinksPage";

const Workspace = ({
  session,
  onLogout,
}: {
  session: AuthSession & { authenticated: true };
  onLogout: () => Promise<void>;
}) => {
  const path = window.location.pathname;
  const pages: Record<string, React.ReactNode> = {
    "/": <DashboardPage />,
    "/skus": <SkuMasterPage />,
    "/inventory": <InventoryPage />,
    "/orders": <OrdersPage />,
    "/orders/new": <CreateOrderPage />,
    "/orders/client-links": <ClientOrderLinksPage />,
    "/receiving": <ReceivingPage />,
    "/packing": <PackingPage />,
    "/packing/start": <StartPackingPage />,
    "/settings": <SettingsPage />,
    "/supplier-requests": <SupplierRequestsPage />,
    "/supplier-requests/new": <NewSupplierRequestPage />,
    "/supplier-requests/group": <GroupSupplierRequestsPage />,
  };

  const inventoryMatch = path.match(/^\/inventory\/([^/]+)$/);
  const orderEditMatch = path.match(/^\/orders\/([^/]+)\/edit$/);
  const orderMatch = path.match(/^\/orders\/([^/]+)$/);
  const packingFinishMatch = path.match(/^\/packing\/([^/]+)\/finish$/);
  const routedPage = pages[path] ? (
    pages[path]
  ) : inventoryMatch ? (
    <InventoryDetailPage sku={decodeURIComponent(inventoryMatch[1]!)} />
  ) : orderEditMatch ? (
    <CreateOrderPage orderId={decodeURIComponent(orderEditMatch[1]!)} />
  ) : orderMatch ? (
    <OrderDetailPage orderId={decodeURIComponent(orderMatch[1]!)} />
  ) : packingFinishMatch ? (
    <FinishPackingPage packingId={decodeURIComponent(packingFinishMatch[1]!)} />
  ) : (
    <PlaceholderPage />
  );

  return (
    <AppShell role={session.role!} onLogout={onLogout}>
      {routedPage}
    </AppShell>
  );
};

const AuthenticatedApp = () => {
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    const expire = () => setSession({ authenticated: false, role: null });
    window.addEventListener("kv-auth-expired", expire);
    void getAuthSession()
      .then((initialSession) =>
        setSession((current) =>
          resolveInitialAuthSession(current, initialSession),
        ),
      )
      .catch(() =>
        setSession((current) =>
          resolveInitialAuthSession(current, {
            authenticated: false,
            role: null,
          }),
        ),
      );
    return () => window.removeEventListener("kv-auth-expired", expire);
  }, []);

  if (!session) {
    return (
      <main
        className="auth-page auth-loading"
        aria-label="Loading secure workspace"
      >
        <img src="/kv-logo.png" alt="" width="54" height="54" />
      </main>
    );
  }
  if (!session.authenticated) {
    return (
      <AuthPage
        onAuthenticated={(authenticatedSession) => {
          window.history.replaceState(null, "", "/");
          setSession(authenticatedSession);
        }}
      />
    );
  }
  return (
    <Workspace
      session={session as AuthSession & { authenticated: true }}
      onLogout={async () => {
        await logout();
        setSession({ authenticated: false, role: null });
      }}
    />
  );
};

export const App = () => {
  const path = window.location.pathname;
  const publicOrderMatch = path.match(/^\/order\/([^/]+)$/);
  if (publicOrderMatch)
    return <PublicOrderPage token={decodeURIComponent(publicOrderMatch[1]!)} />;
  const publicSkuMatch = path.match(/^\/add-sku\/([^/]+)$/);
  if (publicSkuMatch)
    return <PublicSkuPage token={decodeURIComponent(publicSkuMatch[1]!)} />;
  return <AuthenticatedApp />;
};

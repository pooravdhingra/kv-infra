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

export const App = () => {
  const path = window.location.pathname;
  const pages: Record<string, React.ReactNode> = {
    "/": <DashboardPage />,
    "/skus": <SkuMasterPage />,
    "/inventory": <InventoryPage />,
    "/orders": <OrdersPage />,
    "/orders/new": <CreateOrderPage />,
    "/receiving": <ReceivingPage />,
    "/packing": <PackingPage />,
    "/packing/start": <StartPackingPage />,
    "/settings": <SettingsPage />,
  };

  const inventoryMatch = path.match(/^\/inventory\/([^/]+)$/);
  const orderMatch = path.match(/^\/orders\/([^/]+)$/);
  const packingFinishMatch = path.match(/^\/packing\/([^/]+)\/finish$/);
  const routedPage = pages[path] ? (
    pages[path]
  ) : inventoryMatch ? (
    <InventoryDetailPage sku={decodeURIComponent(inventoryMatch[1]!)} />
  ) : orderMatch ? (
    <OrderDetailPage orderId={decodeURIComponent(orderMatch[1]!)} />
  ) : packingFinishMatch ? (
    <FinishPackingPage packingId={decodeURIComponent(packingFinishMatch[1]!)} />
  ) : (
    <PlaceholderPage />
  );

  return <AppShell>{routedPage}</AppShell>;
};

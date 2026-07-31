import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

export const App = () => {
  const isDashboard = window.location.pathname === "/";

  return (
    <AppShell>{isDashboard ? <DashboardPage /> : <PlaceholderPage />}</AppShell>
  );
};

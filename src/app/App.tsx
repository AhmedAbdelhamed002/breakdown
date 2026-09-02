import { BrowserRouter } from "react-router-dom";
import { PowerAppsProvider } from "./providers/PowerAppsProvider";
import { MainLayout } from "./layout/MainLayout";
import { AppRoutes } from "./routes";
import { ActingRoleProvider } from "@features/financial";

export function App() {
  return (
    <PowerAppsProvider>
      <ActingRoleProvider>
        <BrowserRouter>
          <MainLayout>
            <AppRoutes />
          </MainLayout>
        </BrowserRouter>
      </ActingRoleProvider>
    </PowerAppsProvider>
  );
}

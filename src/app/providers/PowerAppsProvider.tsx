import { useEffect, useState, type ReactNode } from "react";
import { initializePowerApps } from "@infrastructure/dataverse/client/powerAppsClient";

export function PowerAppsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void initializePowerApps().then(() => setReady(true));
  }, []);
  if (!ready) return <p style={{ padding: 24 }}>Initializing…</p>;
  return <>{children}</>;
}

import { useEffect, useState } from "react";
import { fetchCurrentUser, type CurrentUser } from "@infrastructure/authentication/currentUser";
import { logger } from "@infrastructure/logging/logger";

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchCurrentUser()
      .then((next) => {
        if (!cancelled) setUser(next);
      })
      .catch((err) => {
        logger.warn("Could not resolve signed-in user", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}

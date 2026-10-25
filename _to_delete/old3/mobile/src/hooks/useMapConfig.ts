import { useEffect, useState } from "react";
import { api } from "../api/client";

let cached: { enabled: boolean; token: string | null } | null = null;

export function useMapConfig() {
  const [config, setConfig] = useState(cached);
  const [loading, setLoading] = useState(!cached);
  useEffect(() => {
    if (cached) return;
    api
      .mapConfig()
      .then((c) => {
        if (c.enabled) cached = c; // never remember "no token": retry next time
        setConfig(c);
      })
      .catch(() => setConfig({ enabled: false, token: null }))
      .finally(() => setLoading(false));
  }, []);
  return { config, loading };
}

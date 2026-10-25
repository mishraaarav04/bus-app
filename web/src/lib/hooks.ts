import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { getSocket } from "./socket";
import { rideIdOf, type RideView, type StaffRideView } from "./types";

/** Every live ride this account may see, kept fresh by the live connection. */
export function useLiveRides() {
  const [rides, setRides] = useState<StaffRideView[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = await api.activeRides();
      setRides(all.filter((r): r is StaffRideView => r.kind === "staff"));
    } catch {
      /* keep what we have */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const socket = getSocket();
    const onUpdate = (view: RideView) => {
      if (view.kind !== "staff") return;
      setRides((prev) => {
        const rest = prev.filter((r) => rideIdOf(r) !== rideIdOf(view));
        return view.session.endedAt ? rest : [...rest, view];
      });
    };
    const onRemoved = (p: { rideId: string }) => setRides((prev) => prev.filter((r) => r.session.id !== p?.rideId));
    socket?.on("ride:update", onUpdate);
    socket?.on("ride:started", onUpdate);
    socket?.on("ride:removed", onRemoved);
    socket?.on("connect", refresh);
    const timer = setInterval(refresh, 60_000); // safety net if the live connection drops
    return () => {
      socket?.off("ride:update", onUpdate);
      socket?.off("ride:started", onUpdate);
      socket?.off("ride:removed", onRemoved);
      socket?.off("connect", refresh);
      clearInterval(timer);
    };
  }, [refresh]);

  return { rides, loading, refresh };
}

/** Run a loader on mount (and when deps change) and keep its result, error and loading flag. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loader());
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

let mapCfg: { enabled: boolean; token: string | null } | null = null;
export function useMapConfig() {
  const [cfg, setCfg] = useState(mapCfg);
  useEffect(() => {
    if (mapCfg) return;
    api
      .mapConfig()
      .then((c) => {
        if (c.enabled) mapCfg = c;
        setCfg(c);
      })
      .catch(() => setCfg({ enabled: false, token: null }));
  }, []);
  return cfg;
}

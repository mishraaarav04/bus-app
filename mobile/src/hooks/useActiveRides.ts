import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { api } from "../api/client";
import { getSocket } from "../api/socket";
import { RideView, rideIdOf } from "../types";

/**
 * Live rides this user may see. The server pushes a view scoped to the user's
 * role on every change, so family accounts only ever get their own child's data.
 */
export function useActiveRides() {
  const [rides, setRides] = useState<RideView[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setRides(await api.activeRides());
    } catch {
      /* keep what we have */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const socket = getSocket();
    const onUpdate = (view: RideView) => {
      setRides((prev) => {
        const id = rideIdOf(view);
        const ended = view.kind === "staff" ? view.session.endedAt : view.endedAt;
        const rest = prev.filter((r) => rideIdOf(r) !== id);
        return ended ? rest : [...rest, view];
      });
    };
    socket?.on("ride:update", onUpdate);
    socket?.on("ride:started", onUpdate);
    socket?.on("connect", refresh);
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => {
      socket?.off("ride:update", onUpdate);
      socket?.off("ride:started", onUpdate);
      socket?.off("connect", refresh);
      sub.remove();
    };
  }, [refresh]);

  return { rides, loading, refresh };
}

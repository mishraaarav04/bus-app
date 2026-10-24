import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { api } from "../api/client";
import { getSocket } from "../api/socket";
import type { AppNotification } from "../types";
import { useAuth } from "./AuthContext";

interface AlertsValue {
  unread: number;
  setUnread: (n: number) => void;
}
const AlertsContext = createContext<AlertsValue>({ unread: 0, setUnread: () => {} });

/** Keeps the unread count for the Alerts tab badge. */
export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    api
      .notifications()
      .then((r) => setUnread(r.unread))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    load();
    const socket = getSocket();
    const onNew = (_n: AppNotification) => setUnread((u) => u + 1);
    socket?.on("notification:new", onNew);
    socket?.on("connect", load);
    const sub = AppState.addEventListener("change", (s) => s === "active" && load());
    return () => {
      socket?.off("notification:new", onNew);
      socket?.off("connect", load);
      sub.remove();
    };
  }, [user?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({ unread, setUnread }), [unread]);
  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export const useAlertsBadge = () => useContext(AlertsContext);

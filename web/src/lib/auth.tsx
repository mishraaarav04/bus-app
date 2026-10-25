import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { adopt, api, forget, hasSavedSession, refreshSession, setSessionHandler, setSignedOutHandler } from "./api";
import { connectSocket, disconnectSocket } from "./socket";
import type { User } from "./types";

interface AuthValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
}
const AuthContext = createContext<AuthValue | undefined>(undefined);

export const isStaff = (u: User | null) => u?.role === "company" || u?.role === "admin";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(hasSavedSession());

  const clear = useCallback(() => {
    forget();
    disconnectSocket();
    setUser(null);
  }, []);

  useEffect(() => {
    setSignedOutHandler(clear);
    setSessionHandler((s) => setUser(s.user));
    return () => {
      setSignedOutHandler(null);
      setSessionHandler(null);
    };
  }, [clear]);

  // Pick up where the person left off.
  useEffect(() => {
    if (!hasSavedSession()) return;
    (async () => {
      try {
        if (!(await refreshSession())) throw new Error("expired");
        const me = await api.me();
        if (!isStaff(me)) throw new Error("not staff");
        setUser(me);
        connectSocket();
      } catch {
        clear();
      } finally {
        setLoading(false);
      }
    })();
  }, [clear]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      setUser,
      signIn: async (email, password) => {
        const s = await api.login(email.trim(), password);
        if (!isStaff(s.user)) {
          // Parents, students and drivers use the phone app.
          adopt(s);
          await api.logout().catch(() => {});
          forget();
          throw new Error("This dashboard is for school and bus company accounts. Parents, students and drivers use the RouteIQ app.");
        }
        adopt(s);
        setUser(s.user);
        connectSocket();
      },
      signOut: async () => {
        await api.logout().catch(() => {});
        clear();
      },
    }),
    [user, loading, clear]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

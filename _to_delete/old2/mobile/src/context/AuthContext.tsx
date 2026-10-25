import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  api,
  getAuthToken,
  getRefreshToken,
  refreshSession,
  setAuthToken,
  setRefreshToken,
  setRefreshedHandler,
  setUnauthorizedHandler,
  type Session,
} from "../api/client";
import { connectSocket, disconnectSocket, getSocket } from "../api/socket";
import { registerForPush, unregisterPush } from "../push";
import { store } from "../storage";
import type { User } from "../types";

const TOKEN_KEY = "wheelie.token";
const REFRESH_KEY = "wheelie.refresh";
const REFRESH_EVERY_MS = 20 * 60 * 1000; // access tokens last 30 minutes

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean; // true while restoring a saved session
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (body: Record<string, unknown>) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Replace the stored user (after a settings change). */
  setUser: (u: User) => void;
  /** Adopt a brand-new session (after a password change signs other devices out). */
  adoptSession: (s: { token: string; refreshToken: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function persist(token: string, refresh: string) {
  await store.set(TOKEN_KEY, token);
  await store.set(REFRESH_KEY, refresh);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const signedIn = useRef(false);

  const begin = useCallback(async (s: Session) => {
    setAuthToken(s.token);
    setRefreshToken(s.refreshToken);
    setToken(s.token);
    setUser(s.user);
    signedIn.current = true;
    connectSocket();
    await persist(s.token, s.refreshToken);
    void registerForPush();
  }, []);

  const clear = useCallback(async () => {
    signedIn.current = false;
    setAuthToken(null);
    setRefreshToken(null);
    setToken(null);
    setUser(null);
    disconnectSocket();
    await store.del(TOKEN_KEY);
    await store.del(REFRESH_KEY);
  }, []);

  const signOut = useCallback(async () => {
    const refresh = getRefreshToken();
    await unregisterPush(); // needs the session, so it goes first
    try {
      await api.logout(refresh);
    } catch {
      /* offline: signing out locally is what matters */
    }
    await clear();
  }, [clear]);

  // A refresh that worked: keep the new tokens, and let the socket use them.
  useEffect(() => {
    setRefreshedHandler((s) => {
      setToken(s.token);
      setUser(s.user);
      void persist(s.token, s.refreshToken);
    });
    setUnauthorizedHandler(() => {
      if (signedIn.current) void clear();
    });
    return () => {
      setRefreshedHandler(null);
      setUnauthorizedHandler(null);
    };
  }, [clear]);

  // Restore a saved session on launch.
  useEffect(() => {
    (async () => {
      try {
        const savedRefresh = await store.get(REFRESH_KEY);
        const savedToken = await store.get(TOKEN_KEY);
        if (savedRefresh) {
          setRefreshToken(savedRefresh);
          setAuthToken(savedToken);
          // Always refresh first: the saved access token is probably stale.
          const ok = await refreshSession();
          if (!ok) throw new Error("expired");
          const me = await api.me();
          await begin({ token: getAuthToken()!, refreshToken: getRefreshToken()!, user: me });
        }
      } catch {
        await clear();
      } finally {
        setLoading(false);
      }
    })();
  }, [begin, clear]);

  // Keep the access token fresh, and recover when the app returns from the background.
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => void refreshSession(), REFRESH_EVERY_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && signedIn.current) {
        void refreshSession().then(() => {
          const sock = getSocket();
          if (sock && !sock.connected) sock.connect();
        });
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the socket is refused because its token expired, refresh and reconnect.
  useEffect(() => {
    const sock = getSocket();
    if (!sock || !token) return;
    const onErr = (e: Error) => {
      if (e.message === "unauthorized") {
        void refreshSession().then((ok) => ok && sock.connect());
      }
    };
    sock.on("connect_error", onErr);
    return () => {
      sock.off("connect_error", onErr);
    };
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      signIn: async (email, password) => {
        await begin(await api.login(email.trim(), password));
      },
      signUp: async (body) => {
        await begin(await api.signup(body));
      },
      signOut,
      refreshUser: async () => {
        setUser(await api.me());
      },
      setUser,
      adoptSession: async (s) => {
        setAuthToken(s.token);
        setRefreshToken(s.refreshToken);
        setToken(s.token);
        await persist(s.token, s.refreshToken);
      },
    }),
    [user, token, loading, begin, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { api, setAuthToken, setUnauthorizedHandler } from "../api/client";
import { connectSocket, disconnectSocket } from "../api/socket";
import type { User } from "../types";

const TOKEN_KEY = "wheelie.token";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean; // true while restoring a saved session
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (body: Record<string, string>) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const begin = useCallback(async (t: string, u: User) => {
    setAuthToken(t);
    setToken(t);
    setUser(u);
    connectSocket(t);
    // Token lives in the OS keychain/keystore, not plain storage.
    await SecureStore.setItemAsync(TOKEN_KEY, t).catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    disconnectSocket();
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  // Restore a saved session on launch.
  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(TOKEN_KEY);
        if (saved) {
          setAuthToken(saved);
          const me = await api.me();
          await begin(saved, me);
        }
      } catch {
        setAuthToken(null);
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      } finally {
        setLoading(false);
      }
    })();
  }, [begin]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      signIn: async (email, password) => {
        const r = await api.login(email.trim(), password);
        await begin(r.token, r.user);
      },
      signUp: async (body) => {
        const r = await api.signup(body);
        await begin(r.token, r.user);
      },
      signOut,
      refreshUser: async () => {
        setUser(await api.me());
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

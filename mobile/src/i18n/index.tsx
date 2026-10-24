import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getLocales } from "expo-localization";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { store } from "../storage";
import type { Lang } from "../types";
import { en, type Key } from "./en";
import { es } from "./es";
import { pt } from "./pt";

export type { Key };
export type TFn = (key: Key, vars?: Record<string, string | number>) => string;

const DICTS: Record<Lang, Record<Key, string>> = { en, es, pt };
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
];
const LANG_KEY = "wheelie.lang";

function deviceLang(): Lang {
  try {
    const code = getLocales()[0]?.languageCode;
    if (code === "es" || code === "pt") return code;
  } catch {
    /* fall through */
  }
  return "en";
}

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

interface I18nValue {
  lang: Lang;
  t: TFn;
  setLang: (l: Lang) => Promise<void>;
  /** Locale tag for dates/times, e.g. "es". */
  locale: string;
}
const I18nContext = createContext<I18nValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuth();
  const [stored, setStored] = useState<Lang>(deviceLang());

  useEffect(() => {
    store.get(LANG_KEY).then((v) => {
      if (v === "en" || v === "es" || v === "pt") setStored(v);
    });
  }, []);

  // A signed-in person's saved choice follows them across phones.
  const lang: Lang = user?.lang ?? stored;

  const setLang = useCallback(
    async (l: Lang) => {
      setStored(l);
      await store.set(LANG_KEY, l);
      if (user) {
        setUser({ ...user, lang: l });
        try {
          setUser(await api.savePreferences({ lang: l }));
        } catch {
          /* kept locally; the server copy updates next time */
        }
      }
    },
    [user, setUser]
  );

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, locale: lang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx;
}

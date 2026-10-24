import * as SecureStore from "expo-secure-store";

// Small values only (tokens, the language, queued scans). The OS keychain/keystore
// keeps them, so they're safe for sign-in tokens. Never throws.
export const store = {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      /* storage unavailable: carry on without it */
    }
  },
  async del(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  },
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  async setJson(key: string, value: unknown): Promise<void> {
    await this.set(key, JSON.stringify(value));
  },
};

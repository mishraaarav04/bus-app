import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests use a throwaway in-memory database.
    env: { DB_PATH: ":memory:", NODE_ENV: "test" },
  },
});

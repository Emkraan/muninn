import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "apps/web"),
    },
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/e2e/**",
      // Integration tests that require a live DATABASE_URL are run at deploy
      // time (see tests/gates), not in the default unit-test CI run.
      "**/importFromHTMLFile.test.ts",
    ],
  },
});

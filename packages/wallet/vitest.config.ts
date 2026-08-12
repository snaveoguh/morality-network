import { defineConfig } from "vitest/config";

// Standalone config. Note: web/vitest.config.ts also includes this package's
// tests, so `npx vitest run` in web/ covers them without a second install —
// packages/wallet/node_modules is a committed symlink to ../../web/node_modules
// (see the note in packages/wallet/README-ish header of package.json).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Next's "server-only" guard throws outside RSC; stub it so server
      // modules (ai-models, ledger service chain) are testable under vitest.
      "server-only": path.resolve(
        __dirname,
        "src/lib/__tests__/stubs/server-only.ts",
      ),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});

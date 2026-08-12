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
      "@pooter/wallet": path.resolve(__dirname, "../packages/wallet/src/index.ts"),
    },
  },
  test: {
    // Includes the shared identity package's tests so one `vitest run` in
    // web/ covers both (packages/wallet resolves deps via its committed
    // node_modules symlink into web/node_modules).
    include: ["src/**/*.test.ts", "../packages/wallet/src/**/*.test.ts"],
  },
});

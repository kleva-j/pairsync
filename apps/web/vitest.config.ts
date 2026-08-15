import path from "node:path";
import { fileURLToPath } from "node:url";

import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tanstackRouter({ target: "react" })],
  resolve: {
    alias: {
      "@": path.resolve(dir, "src"),
      "@pairsync/ui": path.resolve(dir, "../../packages/ui/src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

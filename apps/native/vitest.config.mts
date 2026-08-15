import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": dir,
    },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.{ts,tsx}"],
  },
});

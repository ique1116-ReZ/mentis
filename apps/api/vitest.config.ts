import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@mentis/domain": resolve(__dirname, "../../packages/domain/src/index.ts"),
    },
  },
});

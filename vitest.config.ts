import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "convex/**/*.test.ts",
      "scripts/**/*.test.ts",
      "tests/rendering/**/*.test.tsx",
    ],
    environment: "edge-runtime",
  },
});

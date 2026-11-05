import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: { DATABASE_URL: ":memory:", SESSION_SECRET: "test-secret-test-secret-test-secret-xx" },
  },
});

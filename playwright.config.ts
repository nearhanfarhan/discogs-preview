import { defineConfig } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    // The same standalone server the Docker image runs (`npm run build` copies static assets in).
    command: "node .next/standalone/server.js",
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT), SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e" },
  },
});

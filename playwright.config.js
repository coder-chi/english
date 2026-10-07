import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: ".artifacts/test-results",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "node server/index.js",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: {
      HOST: "127.0.0.1",
      PORT: "3100",
      DB_PATH: ":memory:",
      OPENAI_API_KEY: "",
      DISABLE_AUTOMATION: "true",
    },
  },
});

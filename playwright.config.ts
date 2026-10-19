import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/pwa/**",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5180",
    headless: true,
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
          args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        }
      : {},
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5180",
    url: "http://127.0.0.1:5180",
  },
});

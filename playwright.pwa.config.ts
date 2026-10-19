import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/pwa",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5190", headless: true,
    timezoneId: "Asia/Shanghai", viewport: { width: 390, height: 844 }, hasTouch: true,
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH ? {
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    } : {},
  },
  webServer: {
    command: "pnpm build && PORT=5190 node server/app.mjs",
    url: "http://127.0.0.1:5190", timeout: 120000,
  },
});

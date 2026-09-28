import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const installedChrome = existsSync(
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 30000,
  retries: 0,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5175",
    channel:
      process.env.PLAYWRIGHT_CHANNEL ||
      (installedChrome ? "chrome" : undefined),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "server-catalog",
      testMatch: "server.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5176",
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: "tablet",
      testMatch: "workflow.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 768 },
        isMobile: false,
        hasTouch: true,
      },
    },
    {
      name: "live-contract",
      testMatch: "live.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5174",
        viewport: { width: 1024, height: 768 },
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev -- --port 5176 --strictPort",
      url: "http://127.0.0.1:5176",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        VITE_DATA_MODE: "server",
        VITE_KAKAO_MAP_APP_KEY: "",
        KAKAO_REST_API_KEY: "",
        OPENROUTER_API_KEY: "",
        GROQ_API_KEY: "",
      },
    },
    {
      command: "npm run dev -- --port 5175 --strictPort",
      url: "http://127.0.0.1:5175",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        VITE_DATA_MODE: "demo",
        VITE_KAKAO_MAP_APP_KEY: "",
        KAKAO_REST_API_KEY: "",
        OPENROUTER_API_KEY: "",
        GROQ_API_KEY: "",
      },
    },
    {
      command: "npm run dev -- --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        VITE_DATA_MODE: "live",
        VITE_KAKAO_MAP_APP_KEY: "",
        KAKAO_REST_API_KEY: "",
        OPENROUTER_API_KEY: "",
        GROQ_API_KEY: "",
      },
    },
  ],
});

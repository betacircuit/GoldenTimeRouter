import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { kakaoRoutingPlugin } from "./server/routing";
import { patientExtractionPlugin, DEFAULT_MODEL } from "./server/patient";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    patientExtractionPlugin(
      loadEnv(mode, process.cwd(), "").GROQ_API_KEY || loadEnv(mode, process.cwd(), "").OPENROUTER_API_KEY || "",
      loadEnv(mode, process.cwd(), "").GROQ_API_KEY ? (loadEnv(mode, process.cwd(), "").GROQ_MODEL || "openai/gpt-oss-120b") : loadEnv(mode, process.cwd(), "").OPENROUTER_MODEL || DEFAULT_MODEL,
      loadEnv(mode, process.cwd(), "").GROQ_API_KEY ? "groq" : "openrouter",
    ),
    kakaoRoutingPlugin(
      loadEnv(mode, process.cwd(), "").KAKAO_REST_API_KEY || "",
    ),
  ],
  test: { include: ["src/**/*.test.ts"], environment: "node" },
  server: {
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
}));

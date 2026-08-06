/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx,js,jsx}"],
    maxWorkers: 2,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    css: true,
    coverage: {
      include: ["src/app/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.fixture.ts", "src/test/**"],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 65,
        lines: 75,
      },
    },
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "./src/app"),
    },
  },
});

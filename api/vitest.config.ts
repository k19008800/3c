import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    globalSetup: ["./src/__tests__/setup.ts"],
    include: ["src/__tests__/**/*.test.ts"],
    fileParallelism: false,
    pool: "forks",
  },
});

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@3cloud/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
});

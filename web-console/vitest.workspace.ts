import { resolve } from 'path';
import { fileURLToPath } from 'node:url';

/**
 * web-console 测试工作区（Vitest workspace）— 拆分 node 与 jsdom 两套环境。
 *
 * node  : 纯 TS 逻辑测试（i18n / fmt / store 等），无需 DOM。
 * jsdom : React 组件级 UI 测试（*.test.tsx），jsdom + Testing Library，
 *         加载 jest-dom 匹配器（src/test/setup.ts）。
 *
 * 历史 vitest.config.ts 仅 environment='node' 覆盖 src 下 *.test.ts；
 * Impersonation 组件级测试需 jsdom 渲染（PRD §5 注记），此处为其补齐。
 * 每个 project 独立 include，保证 node 与 jsdom 各跑各的测试文件。
 */
const shared = {
  globals: true,
  testTimeout: 30000,
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov'],
  },
};

export default [
  {
    test: {
      ...shared,
      name: 'node',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
    resolve: {
      alias: { '@3cloud/shared': resolve(fileURLToPath(new URL('.', import.meta.url)), '../../packages/shared/src') },
    },
  },
  {
    test: {
      ...shared,
      name: 'jsdom',
      environment: 'jsdom',
      include: ['src/**/*.test.tsx'],
      setupFiles: ['./src/test/setup.ts'],
    },
    resolve: {
      alias: { '@3cloud/shared': resolve(fileURLToPath(new URL('.', import.meta.url)), '../../packages/shared/src') },
    },
  },
];


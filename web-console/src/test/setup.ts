/**
 * jsdom 环境测试的全局 setup（经 vitest.config.ts 的 jsdom project.setupFiles 载入）。
 *
 * 职责：
 *  - 注册 @testing-library/jest-dom 匹配器（toBeInTheDocument / toHaveTextContent 等）
 *  - 补充 jsdom 未实现但组件渲染/交互常用到的浏览器 API：
 *    requestAnimationFrame / cancelAnimationFrame、scrollTo、matchMedia、
 *    ResizeObserver，避免 shared-ui 的 Modal/响应式交互抛错。
 *
 * 仅对 *.test.tsx（jsdom 环境）生效；node 环境纯逻辑测试不受影响。
 */
import '@testing-library/jest-dom/vitest';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

if (typeof window !== 'undefined') {
  if (typeof window.scrollTo !== 'function') {
    window.scrollTo = () => {};
  }
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  }
  if (typeof window.ResizeObserver === 'undefined') {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  }
}


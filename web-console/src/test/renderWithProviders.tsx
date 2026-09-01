/**
 * 组件级测试共用渲染工具：MemoryRouter + QueryClient 包裹。
 *
 * @3cloud/shared-ui 与 ../lib/api 由各测试文件自行 vi.mock；本模块仅负责
 * 提供确定性的路由/数据获取环境，避免真实网络与真实浏览器环境。
 */
import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * 生成测试专用 QueryClient：retry=false 防失败重试导致测试抖动；
 * 全局 mutator 关闭（避免测试误触缓存写入，但保留内存缓存以支持 invalidate）。
 *
 * @returns 新的 QueryClient 实例
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * 用 MemoryRouter + QueryClientProvider 渲染组件，并返回渲染结果。
 *
 * @param ui - 待渲染的组件（通常搭配 Routes/Route 使用 useNavigate/useParams）
 * @param opts.routePath - 匹配当前路由的 path 模板（如 `/admin/customers/:userId`）
 * @param opts.initialEntry - 初始 URL（默认 `/`）
 * @returns render 结果（含 screen 断言所需容器）
 */
export function renderWithProviders(
  ui: ReactElement,
  opts: { routePath?: string; initialEntry?: string } = {},
): RenderResult & { queryClient: QueryClient } {
  const { routePath, initialEntry = "/" } = opts;
  const queryClient = createTestQueryClient();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        {routePath ? (
          <Routes>
            <Route path={routePath} element={ui} />
            {/* 兜底路由：模拟成功后 navigate("/") 等跳转不产生 "No routes matched" 噪音 */}
            <Route path="*" element={<div />} />
          </Routes>
        ) : (
          ui
        )}
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}


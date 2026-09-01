/**
 * ConsoleLayout 模拟模式横幅（Impersonation）组件级 UI 测试（jsdom）。
 *
 * 覆盖 PRD §5.4 顶部横幅：
 *  - impersonatedBy 与 user 都存在 → 显示「🔓 正在以 {user.email} 身份查看（由 {impersonatedBy.email} 模拟）」+ [?] 帮助；
 *  - 点击「退出模拟」→ stopImpersonation() 被调用，并跳转回 /admin/customers；
 *  - 正常态（无 impersonatedBy）→ 不渲染横幅。
 *
 * 布局有侧栏导航/Topbar/i18n/ConsentBanner 等重依赖，本测试按需隔离：
 *  - vi.mock @3cloud/shared-ui（最小实现）；
 *  - vi.mock ../lib/i18n-context（useI18n 返回占位 t）；
 *  - vi.mock ../components/ConsentBanner（横幅不在测试范围）；
 *  - vi.mock ../lib/api（不跑真实网络）。
 *
 * @module layouts/ConsoleLayout.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import { useAuthStore, type User } from "../store/auth";
import { renderWithProviders } from "../test/renderWithProviders";
import ConsoleLayout from "./ConsoleLayout";

vi.mock("@3cloud/shared-ui", async () => {
  const m = await import("../test/sharedUiMock");
  return m;
});

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  extractError: (e: unknown) =>
    (e as any)?.response?.data?.message ?? (e as any)?.message ?? "请求失败",
}));

vi.mock("../components/ConsentBanner", () => ({ default: () => null }));

vi.mock("../lib/i18n-context", () => ({
  useI18n: () => ({ t: (k: string) => k, lang: "zh-CN", isReady: true, setLanguage: vi.fn() }),
}));

import { api } from "../lib/api";

const adminUser: User = {
  id: 1,
  email: "admin@unmisa.com",
  username: "admin",
  role: "super_admin",
  status: "active",
  balance: 0,
  realNameStatus: null,
};

/**
 * 渲染 ConsoleLayout，并监听 /admin/customers 路由以便断言退出模拟后的跳转。
 * @returns renderWithProviders 结果（含 queryClient）。
 */
function renderLayout() {
  return renderWithProviders(
    <Routes>
      <Route path="*" element={<ConsoleLayout />} />
      <Route path="/admin/customers" element={<div>customer-list-marker</div>} />
    </Routes>,
    { initialEntry: "/" },
  );
}

/** 获取被 vi.mock 过的 api 模块。@returns api 实例（含 get/post mock）。 */
function mockApi() {
  return api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  const m = mockApi();
  // 未读公告查询需 resolve，避免 react-query 抛错
  m.get.mockResolvedValue({ data: { data: { unread: 0 } } });
});

describe("ConsoleLayout — 模拟模式横幅", () => {
  it("impersonatedBy 与 user 均存在时显示横幅（含用户邮箱/发起者）+ [?] 帮助", () => {
    const realStop = useAuthStore.getState().stopImpersonation;
    const stopSpy = vi.fn(realStop);
    useAuthStore.setState({
      user: adminUser,
      impersonatedBy: { id: 1, email: "admin@unmisa.com" },
      token: "admin-token",
      stopImpersonation: stopSpy,
    });

    renderLayout();

    const banner = screen.getByText(/正在以 admin@unmisa.com 身份查看（由 admin@unmisa.com 模拟）/);
    expect(banner).toBeInTheDocument();
    // [?] 帮助：横幅内含帮助文案
    expect(screen.getByText(/模拟期间敏感资金与权限写操作被禁用/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /退出模拟/ })).toBeInTheDocument();
  });

  it("点击「退出模拟」→ stopImpersonation() 被调用并跳转回 /admin/customers", async () => {
    const user = userEvent.setup();
    const realStop = useAuthStore.getState().stopImpersonation;
    const stopSpy = vi.fn(realStop);
    useAuthStore.setState({
      user: adminUser,
      impersonatedBy: { id: 1, email: "admin@unmisa.com" },
      token: "admin-token",
      stopImpersonation: stopSpy,
    });

    renderLayout();
    const exitBtn = screen.getByRole("button", { name: /退出模拟/ });
    await user.click(exitBtn);

    expect(stopSpy).toHaveBeenCalledTimes(1);
    // 跳转回客户列表路由
    expect(await screen.findByText("customer-list-marker")).toBeInTheDocument();
    // 退出后横幅消失
    expect(screen.queryByRole("button", { name: /退出模拟/ })).not.toBeInTheDocument();
  });

  it("正常态（无 impersonatedBy）不渲染横幅", () => {
    const realStop = useAuthStore.getState().stopImpersonation;
    useAuthStore.setState({
      user: adminUser,
      impersonatedBy: null,
      token: "admin-token",
      stopImpersonation: realStop,
    });

    renderLayout();

    expect(screen.queryByRole("button", { name: /退出模拟/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/正在以 admin@unmisa.com 身份查看/)).not.toBeInTheDocument();
  });
});


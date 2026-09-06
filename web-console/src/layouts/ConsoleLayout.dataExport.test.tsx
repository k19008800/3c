/**
 * ConsoleLayout 数据导出菜单条件渲染测试（PRD §4.1 + 验收 D1-D3）
 *
 * 覆盖：
 *  - D1：未授权用户登录 → 侧边栏「不显示」数据导出菜单
 *  - D2：授权且启用（granted && isEnabled）用户 → 侧边栏「显示」数据导出菜单
 *  - D3：授权但停用用户 → 菜单隐藏
 *
 * 依赖隔离（与 ConsoleLayout.test.tsx 相同的 mock 策略）：
 *  - vi.mock @3cloud/shared-ui / api / i18n-context / ConsentBanner
 *  - api.get 按 URL 分发：/me/announcements/unread-count → unread；/me/data-export/grant-status → 授权状态
 *
 * @module layouts/ConsoleLayout.dataExport.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
  useI18n: () => ({
    // t 直接返回 key，因此菜单文案「nav.dataExport」原样渲染为链接文本
    t: (k: string) => k,
    lang: "zh-CN",
    isReady: true,
    setLanguage: vi.fn(),
  }),
}));

import { api } from "../lib/api";

/** 门户普通用户（role=customer，非管理员） */
const portalUser: User = {
  id: 10,
  email: "user@example.com",
  username: "user",
  role: "customer",
  status: "active",
  balance: 100,
  realNameStatus: null,
};

/** api.get 的 mock 实例 */
function mockApi() {
  return api as unknown as { get: ReturnType<typeof vi.fn> };
}

/**
 * 配置 api.get 按 URL 分发：
 *  - unread-count → { unread: 0 }
 *  - grant-status → { granted, isEnabled }（可配）
 */
function mockGetByUrl(grants: { granted: boolean; enabled: boolean }) {
  const m = mockApi();
  m.get.mockImplementation((url: string) => {
    if (url.includes("unread-count")) {
      return Promise.resolve({ data: { data: { unread: 0 } } });
    }
    if (url.includes("grant-status")) {
      return Promise.resolve({
        data: { data: { granted: grants.granted, isEnabled: grants.enabled } },
      });
    }
    return Promise.resolve({ data: { data: {} } });
  });
}

function renderPortal() {
  return renderWithProviders(
    <Routes>
      <Route path="*" element={<ConsoleLayout />} />
    </Routes>,
    { initialEntry: "/" },
  );
}

describe("ConsoleLayout — 数据导出菜单条件渲染（PRD §4.1 / D1-D3）", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAuthStore.setState({
      user: portalUser,
      impersonatedBy: null,
      token: "portal-token",
    });
  });

  it("D1：未授权（granted=false）→ 侧边栏不显示数据导出菜单", async () => {
    mockGetByUrl({ granted: false, enabled: false });
    renderPortal();
    // 等待授权状态查询 resolve 后断言
    expect(await screen.findByText("nav.apiKeys")).toBeInTheDocument();
    expect(screen.queryByText("nav.dataExport")).not.toBeInTheDocument();
  });

  it("D2：授权且启用（granted && enabled）→ 侧边栏显示数据导出菜单", async () => {
    mockGetByUrl({ granted: true, enabled: true });
    renderPortal();
    expect(await screen.findByText("nav.dataExport")).toBeInTheDocument();
  });

  it("D3：授权但停用（granted && !enabled）→ 菜单隐藏", async () => {
    mockGetByUrl({ granted: true, enabled: false });
    renderPortal();
    expect(await screen.findByText("nav.apiKeys")).toBeInTheDocument();
    expect(screen.queryByText("nav.dataExport")).not.toBeInTheDocument();
  });

  it("D3b：未授权但 enabled（granted=false）→ 菜单隐藏（条件 = granted && isEnabled）", async () => {
    mockGetByUrl({ granted: false, enabled: true });
    renderPortal();
    expect(await screen.findByText("nav.apiKeys")).toBeInTheDocument();
    expect(screen.queryByText("nav.dataExport")).not.toBeInTheDocument();
  });
});

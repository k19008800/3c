/**
 * AdminCustomerDetailPage「以用户身份登录（Impersonation）」组件级 UI 测试（jsdom）。
 *
 * 覆盖 PRD §5.3 详情页头部按钮：
 *  - 头部存在「以用户身份登录」按钮，点击发起 POST /admin/customers/:id/impersonate
 *    （成功后 startImpersonation / token 切换与列表页共用 useMutation 逻辑，这里验证请求发起与模拟态写入）；
 *  - 按钮旁存在 [?] 帮助（文案含「敏感资金与权限写操作被禁用」）。
 *
 * 依赖隔离：vi.mock @3cloud/shared-ui 与 ../lib/api；路由经 MemoryRouter（:userId）解析。
 *
 * @module pages/AdminCustomerDetailPage.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { useAuthStore, type User } from "../store/auth";
import { renderWithProviders } from "../test/renderWithProviders";
import { resetToastSpies } from "../test/sharedUiMock";
import AdminCustomerDetailPage from "./AdminCustomerDetailPage";

vi.mock("@3cloud/shared-ui", async () => {
  const m = await import("../test/sharedUiMock");
  return m;
});

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  extractError: (e: unknown) =>
    (e as any)?.response?.data?.message ?? (e as any)?.message ?? "请求失败",
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

const ADMIN_TOKEN = "admin-jwt-token";
const IMP_TOKEN = "impersonate-jwt-token";

const detail = {
  id: 999,
  user_id: 42,
  username: "张三",
  email: "cust@example.com",
  status: "active",
  status_label: "正常",
  balance: 50000,
  real_name_verified: true,
  real_name_label: "已认证",
  quota_total: 1000,
  quota_used: 100,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  phone: null,
  company: null,
  salesperson_id: null,
  salesperson_name: null,
  tags: [],
};

function mockApi() {
  return api as unknown as {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

/**
 * 装配默认 mock：GET 客户详情/消费列表返回示例数据；user 置为 admin 正常登录态，
 * 并把 startImpersonation 包装为可断言的 spy（仍执行真实逻辑）。
 * @returns 包装后的 startImpersonation spy。
 */
function setupDefault() {
  const m = mockApi();
  m.get.mockImplementation((url: unknown) => {
    const u = String(url);
    if (u.includes("/consumption")) return Promise.resolve({ data: { data: { list: [] } } });
    if (u === "/admin/customers/42") return Promise.resolve({ data: { data: detail } });
    return Promise.resolve({ data: {} });
  });
  const realStart = useAuthStore.getState().startImpersonation;
  const startSpy = vi.fn(realStart);
  useAuthStore.setState({
    user: adminUser,
    impersonatedBy: null,
    token: ADMIN_TOKEN,
    startImpersonation: startSpy,
  });
  return { startSpy };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  resetToastSpies();
});

describe("AdminCustomerDetailPage — 以用户身份登录", () => {
  it("头部存在「以用户身份登录」按钮，点击发起 impersonate 并写入模拟态", async () => {
    const user = userEvent.setup();
    const { startSpy } = setupDefault();
    const m = mockApi();
    m.post.mockResolvedValue({
      data: {
        user: { id: 42, email: "cust@example.com", name: "张三", role: "customer" },
        accessToken: IMP_TOKEN,
        impersonateBy: { adminId: 1, adminEmail: "admin@unmisa.com" },
      },
    });

    renderWithProviders(<AdminCustomerDetailPage />, {
      routePath: "/admin/customers/:userId",
      initialEntry: "/admin/customers/42",
    });

    const btn = await screen.findByRole("button", { name: /以用户身份登录/ });
    expect(btn).toBeInTheDocument();

    await user.click(btn);

    expect(m.post).toHaveBeenCalledWith("/admin/customers/42/impersonate");
    await waitFor(() => expect(startSpy).toHaveBeenCalledTimes(1));
    expect(startSpy.mock.calls[0]![0]).toBe(IMP_TOKEN);
    expect(startSpy.mock.calls[0]![1]).toMatchObject({ id: 42, email: "cust@example.com" });
    expect(useAuthStore.getState().token).toBe(IMP_TOKEN);
    expect(useAuthStore.getState().impersonatedBy).toEqual({ id: 1, email: "admin@unmisa.com" });
  });

  it("按钮旁存在 [?] 帮助，文案含「敏感资金与权限写操作被禁用」", async () => {
    setupDefault();
    renderWithProviders(<AdminCustomerDetailPage />, {
      routePath: "/admin/customers/:userId",
      initialEntry: "/admin/customers/42",
    });

    const btn = await screen.findByRole("button", { name: /以用户身份登录/ });
    expect(btn.textContent).toContain("[?]");
    expect(btn.textContent).toContain("敏感资金与权限写操作被禁用");
  });
});


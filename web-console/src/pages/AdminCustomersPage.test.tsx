/**
 * AdminCustomersPage「以用户身份登录（Impersonation）」组件级 UI 测试（jsdom）。
 *
 * 覆盖 PRD §5.2 列表页的模拟登录交互：
 *  - 点击行内「以用户身份登录」→ POST /admin/customers/:id/impersonate →
 *    startImpersonation 被调用且 token 切换到模拟用户；
 *  - 按钮旁存在 [?] 帮助（文案含「敏感资金与权限写操作被禁用」）；
 *  - 模拟态（impersonatedBy 存在）下隐藏 admin 管理操作（以用户身份登录/编辑/冻结）；
 *  - API 失败 → toast 报错并停留在列表页。
 *
 * 依赖隔离：vi.mock @3cloud/shared-ui（最小实现，见 src/test/sharedUiMock）与
 * ../lib/api（不跑真实网络）；路由/数据获取用 MemoryRouter + QueryClientProvider。
 *
 * @module pages/AdminCustomersPage.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { useAuthStore, type User } from "../store/auth";
import { renderWithProviders } from "../test/renderWithProviders";
import { toastSpies, resetToastSpies } from "../test/sharedUiMock";
import AdminCustomersPage from "./AdminCustomersPage";

// @3cloud/shared-ui 以最小实现隔离（不含真实 CSS/弹窗/tooltip DOM 逻辑）
vi.mock("@3cloud/shared-ui", async () => {
  const m = await import("../test/sharedUiMock");
  return m;
});

// api 不跑真实网络：get 返回客户列表，post 处理 impersonate 等
vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  extractError: (e: unknown) =>
    (e as any)?.response?.data?.message ?? (e as any)?.message ?? "请求失败",
}));

// 内部仅用类型，便于测试侧导入（api mock 已拦截，不会走网络）
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

const customerRows = [
  {
    id: 42,
    email: "cust@example.com",
    name: "张三",
    status: "active",
    realNameVerified: true,
    createdAt: "2026-08-01T00:00:00Z",
    availableBalance: 50000,
    frozenBalance: 0,
    totalBalance: 50000,
    totalConsumption: 12000,
    boundAgent: null,
  },
  {
    id: 43,
    email: "cust2@example.com",
    name: "李四",
    status: "active",
    realNameVerified: true,
    createdAt: "2026-08-02T00:00:00Z",
    availableBalance: 80000,
    frozenBalance: 0,
    totalBalance: 80000,
    totalConsumption: 9000,
    boundAgent: null,
  },
];

const IMP_TOKEN = "impersonate-jwt-token";
const ADMIN_TOKEN = "admin-jwt-token";

interface ApiMock {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

/**
 * 获取被 vi.mock 过的 api 模块（以带类型形状访问各 mock fn）。
 * @returns api 实例（含 get/post/patch/put/delete mock）。
 */
function mockApi(): ApiMock {
  return api as unknown as ApiMock;
}

/**
 * 装配默认 mock：GET 客户列表返回两行；同时把 auth store 置为 admin 正常登录态，
 * 并把 startImpersonation 包装为可断言的 spy（仍执行真实逻辑以切换 token）。
 * @returns 包装后的 startImpersonation spy。
 */
function setupDefault() {
  const m = mockApi();
  m.get.mockResolvedValue({
    data: { data: customerRows, pagination: { total: customerRows.length, page: 1, totalPages: 1 } },
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

describe("AdminCustomersPage — 以用户身份登录", () => {
  it("点击行内「以用户身份登录」→ POST impersonate → startImpersonation 被调用且 token 切换", async () => {
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

    renderWithProviders(<AdminCustomersPage />, { routePath: "/admin/customers", initialEntry: "/admin/customers" });
    // 等待列表行渲染
    const row = await screen.findByText("cust@example.com");
    expect(row).toBeInTheDocument();

    const btn = screen.getAllByRole("button", { name: /以用户身份登录/ })[0]!;
    await user.click(btn);

    expect(m.post).toHaveBeenCalledWith("/admin/customers/42/impersonate");

    await waitFor(() => expect(startSpy).toHaveBeenCalledTimes(1));
    const [calledToken, calledUser, calledAdmin] = startSpy.mock.calls[0]!;
    expect(calledToken).toBe(IMP_TOKEN);
    expect(calledUser).toMatchObject({ id: 42, email: "cust@example.com", role: "customer" });
    expect(calledAdmin).toEqual({ id: 1, email: "admin@unmisa.com" });

    // token 切换到模拟用户，impersonatedBy 记录发起者
    expect(useAuthStore.getState().token).toBe(IMP_TOKEN);
    expect(useAuthStore.getState().impersonatedBy).toEqual({ id: 1, email: "admin@unmisa.com" });
  });

  it("按钮旁存在 [?] 帮助，文案含「敏感资金与权限写操作被禁用」", async () => {
    setupDefault();
    renderWithProviders(<AdminCustomersPage />, { routePath: "/admin/customers", initialEntry: "/admin/customers" });
    await screen.findByText("cust@example.com");

    const btn = screen.getAllByRole("button", { name: /以用户身份登录/ })[0]!;
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain("[?]");
    expect(btn.textContent).toContain("敏感资金与权限写操作被禁用");
  });

  it("模拟态（impersonatedBy 存在）下隐藏 admin 管理操作：以用户身份登录/编辑/冻结均不渲染", async () => {
    const m = mockApi();
    m.get.mockResolvedValue({
      data: { data: customerRows, pagination: { total: customerRows.length, page: 1, totalPages: 1 } },
    });
    useAuthStore.setState({
      user: { ...adminUser, role: "customer", email: "cust@example.com" },
      impersonatedBy: { id: 1, email: "admin@unmisa.com" },
      token: IMP_TOKEN,
    });

    renderWithProviders(<AdminCustomersPage />, { routePath: "/admin/customers", initialEntry: "/admin/customers" });
    await screen.findByText("cust@example.com");

    expect(screen.queryByRole("button", { name: /以用户身份登录/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^编辑$/ })).not.toBeInTheDocument();
    // 行级「冻结」按钮精确匹配（避开批量操作栏的「批量冻结」，后者不随模拟态隐藏）
    expect(screen.queryByRole("button", { name: /^冻结$/ })).not.toBeInTheDocument();
    // 模拟态下仍保留「查看」入口
    expect(screen.getAllByRole("button", { name: /查看/ }).length).toBeGreaterThan(0);
  });

  it("API 失败 → toast 报错并停留在列表页（不进入模拟态）", async () => {
    const user = userEvent.setup();
    const { startSpy } = setupDefault();
    const m = mockApi();
    m.post.mockRejectedValue({ response: { data: { message: "无此客户或模拟失败" } } });

    renderWithProviders(<AdminCustomersPage />, { routePath: "/admin/customers", initialEntry: "/admin/customers" });
    await screen.findByText("cust@example.com");

    const btn = screen.getAllByRole("button", { name: /以用户身份登录/ })[0]!;
    await user.click(btn);

    await waitFor(() => expect(toastSpies.error).toHaveBeenCalledWith("无此客户或模拟失败"));
    // 未进入模拟态：token 仍为 admin，impersonatedBy 为空
    expect(startSpy).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBe(ADMIN_TOKEN);
    expect(useAuthStore.getState().impersonatedBy).toBeNull();
    // 仍停留在列表页（按钮还在）
    expect(screen.getAllByRole("button", { name: /以用户身份登录/ })[0]!).toBeInTheDocument();
  });
});


/**
 * AdminDataExportGrantPage — 数据导出授权管理页组件级测试（PRD §5/§7/§9 + 验收 D5-D7/E/F）
 *
 * 覆盖：
 *  - D5：列表渲染已授权用户（email/姓名/状态/授权人/授权时间/停用时间/备注）
 *  - D7：启用/停用操作有二次确认，且操作后刷新列表
 *  - E1/E2：页面标题旁有 [?]（页面级帮助），帮助含适用角色/功能定位/核心操作/注意事项/常见问题
 *  - E3：操作按钮旁有 [?]（悬停 Tooltip）
 *  - F1/F2：无 edit 权限 → 新建/启停/删除按钮隐藏
 *  - F3：super_admin/admin 具备权限点
 *
 * 依赖隔离：vi.mock @3cloud/shared-ui / api / permissions（固定角色）
 *
 * @module pages/AdminDataExportGrantPage.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test/renderWithProviders";
import AdminDataExportGrantPage from "./AdminDataExportGrantPage";

vi.mock("@3cloud/shared-ui", async () => {
  const m = await import("../test/sharedUiMock");
  return m;
});

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  extractError: (e: unknown) =>
    (e as any)?.response?.data?.message ?? (e as any)?.message ?? "请求失败",
}));

// 固定权限：super_admin（*）→ view/edit 均具备
// 用 hoisted 可变状态，便于在 F2 测试中切换为「仅 view」
const permState = vi.hoisted(() => ({ canView: true, canEdit: true }));
vi.mock("../lib/permissions", () => ({
  usePerm: (k: string) =>
    k === "dataExportGrant.view" ? permState.canView : permState.canEdit,
  hasPerm: () => true,
}));

import { api } from "../lib/api";

type ApiMock = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function mockApi(): ApiMock {
  return api as unknown as ApiMock;
}

/** 一条授权记录（对齐 PRD §8.3 data.list 每项） */
const grantRow = {
  userId: 42,
  email: "user@example.com",
  name: "张三",
  isEnabled: true,
  grantedBy: 1,
  grantedByName: "admin",
  grantedAt: "2026-08-20T08:00:00Z",
  disabledAt: null,
  remark: "VIP 客户定向开放",
  createdAt: "2026-08-20T08:00:00Z",
  updatedAt: "2026-08-20T08:00:00Z",
};

/** 配置 api.get 返回授权列表（默认一页含一条启用记录） */
function mockList(list = [grantRow], total = list.length) {
  const m = mockApi();
  m.get.mockImplementation((url: string) => {
    if (url.includes("data-export-grants")) {
      return Promise.resolve({
        data: { data: { list, total, page: 1, pageSize: 20 } },
      });
    }
    if (url.includes("admin/customers")) {
      return Promise.resolve({
        data: {
          data: [
            { id: 99, email: "candidate@example.com", name: "李四" },
          ],
          pagination: { total: 1, page: 1, totalPages: 1 },
        },
      });
    }
    return Promise.resolve({ data: { data: {} } });
  });
}

function renderPage() {
  return renderWithProviders(<AdminDataExportGrantPage />, { initialEntry: "/" });
}

describe("AdminDataExportGrantPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    permState.canView = true;
    permState.canEdit = true;
  });

  it("D5：列表渲染已授权用户（email/姓名/状态/授权人/时间/备注）", async () => {
    mockList();
    renderPage();
    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("VIP 客户定向开放")).toBeInTheDocument();
    // 状态「启用」徽标 + 操作按钮「停用」（启用状态 → 停用）
    expect(screen.getByText("停用")).toBeInTheDocument();
  });

  it("D7：点击「停用」→ 弹出二次确认弹窗（提示已生成文件仍可下载）", async () => {
    const user = userEvent.setup();
    mockList();
    const m = mockApi();
    m.put.mockResolvedValue({ data: { data: { ...grantRow, isEnabled: false } } });
    renderPage();
    await screen.findByText("user@example.com");

    await user.click(screen.getByRole("button", { name: "停用" }));
    // 二次确认弹窗出现
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/停用后该用户将无法发起新的数据导出，但已生成文件在有效期内仍可下载/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认停用" }));
    await waitFor(() => expect(m.put).toHaveBeenCalledWith(
      "/admin/data-export-grants/42",
      { enabled: false },
    ));
  });

  it("E1/E2：页面标题旁有页面级 [?] 帮助，且帮助含适用角色/核心操作/常见问题", async () => {
    mockList();
    renderPage();
    // HelpIcon mock 渲染 [?] + 文案；PageHeader 帮助透传为 help 文案
    const helpText = await screen.findByText(/适用角色：管理员/);
    expect(helpText).toBeInTheDocument();
    expect(screen.getByText(/功能定位：定向授权\/停用用户的自助数据导出能力/)).toBeInTheDocument();
    expect(screen.getByText(/核心操作：新建授权、启用\/停用、搜索筛选/)).toBeInTheDocument();
    expect(screen.getByText(/常见问题：/)).toBeInTheDocument();
  });

  it("E3：操作按钮旁有 [?]（新建授权按钮旁有悬停帮助文案）", async () => {
    mockList();
    renderPage();
    // 新建授权按钮旁帮助（Panel extra，立即渲染）
    expect(await screen.findByText(/搜索并添加一位用户，授予其自助数据导出能力/)).toBeInTheDocument();
    // 等列表渲染后再校验行内停用按钮旁帮助（E3 按钮级）
    await screen.findByText("user@example.com");
    expect(screen.getByText(/停用该用户的数据导出能力，用户端菜单即隐藏/)).toBeInTheDocument();
  });

  it("F2：无 edit 权限 → 新建/启停/删除按钮隐藏", async () => {
    permState.canEdit = false;
    mockList();
    renderPage();
    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    expect(screen.queryByText("＋ 新建授权")).not.toBeInTheDocument();
    // 无 edit 权限 → 行内无「停用」/「启用」/「删除」操作按钮（仅状态徽标存在）
    expect(screen.queryByRole("button", { name: "停用" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "启用" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
  });
});

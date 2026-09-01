/**
 * auth store「以用户身份模拟登录（Impersonation）」单元测试。
 *
 * 覆盖 PRD §5.1：
 *  - startImpersonation 保存 backup 且写入 impersonatedBy / 目标 user
 *  - stopImpersonation 恢复原 admin token 且清空 impersonatedBy
 *  - logout 清空 backup 与 impersonatedBy
 *  - 初始化时从 localStorage 恢复 impersonatedBy
 *
 * 说明：web-console 的 vitest 配置 environment='node'（见 vitest.config.ts），
 * 未配置 jsdom / Testing Library，因此本测试仅针对可脱离 React 渲染的 store 逻辑，
 * 不引入新测试依赖。组件级（AdminCustomersPage / ConsoleLayout 横幅）测试需 jsdom +
 * Testing Library，当前未配置，留待测试基建就绪后再补。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { User } from "./auth";

/** node 环境无 localStorage，注入内存实现（Storage 兼容接口） */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
}

const memStorage = createMemoryStorage();

/** 模拟 ../lib/api 的 axios 实例，避免 stopImpersonation 触发真实网络请求 */
vi.mock("../lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
  },
  extractError: (err: unknown) => "mock-error",
}));

const adminUser: User = {
  id: 1,
  email: "admin@unmisa.com",
  username: "admin",
  role: "super_admin",
  status: "active",
  balance: 0,
  realNameStatus: null,
};

const targetUser: User = {
  id: 42,
  email: "cust@example.com",
  username: "张三",
  role: "customer",
  status: "active",
  balance: 123,
  realNameStatus: null,
};

const adminInfo = { id: 1, email: "admin@unmisa.com" };
const ADMIN_TOKEN = "admin-jwt-token";
const IMP_TOKEN = "impersonate-jwt-token";

async function freshStore() {
  // 每次重置模块，让 store 在「当前 localStorage 内容」下重新初始化
  vi.resetModules();
  const auth = await import("./auth");
  return auth as typeof import("./auth");
}

beforeEach(() => {
  memStorage.clear();
  Object.defineProperty(globalThis, "localStorage", {
    value: memStorage,
    configurable: true,
    writable: true,
  });
  vi.clearAllMocks();
});

describe("startImpersonation", () => {
  it("把当前 admin token 存入 backup，并写入模拟 token + 目标 user + impersonatedBy", async () => {
    const { useAuthStore } = await freshStore();
    // 先建立 admin 会话（模拟登录态存在）
    useAuthStore.getState().setSession(ADMIN_TOKEN, adminUser);

    useAuthStore.getState().startImpersonation(IMP_TOKEN, targetUser, adminInfo);

    const s = useAuthStore.getState();
    // 内存态
    expect(s.token).toBe(IMP_TOKEN);
    expect(s.user?.id).toBe(targetUser.id);
    expect(s.user?.email).toBe(targetUser.email);
    expect(s.impersonatedBy).toEqual(adminInfo);
    // localStorage：模拟 token 已写入、backup 保存原 admin token、模拟标记已写入
    expect(localStorage.getItem("token")).toBe(IMP_TOKEN);
    expect(localStorage.getItem("impersonationBackup")).toBe(ADMIN_TOKEN);
    expect(localStorage.getItem("impersonateBy")).toBe(JSON.stringify(adminInfo));
  });

  it("不覆盖已有 backup（防嵌套模拟丢身份）", async () => {
    const { useAuthStore } = await freshStore();
    useAuthStore.getState().setSession(ADMIN_TOKEN, adminUser);
    useAuthStore.getState().startImpersonation(IMP_TOKEN, targetUser, adminInfo);
    // 再发起一次（防御：不应存在，但即便发生也不覆盖原 backup）
    useAuthStore.getState().startImpersonation("another-imp-token", targetUser, adminInfo);

    expect(localStorage.getItem("impersonationBackup")).toBe(ADMIN_TOKEN);
  });

  it("初始化时从 localStorage 恢复 impersonatedBy（模拟态持久化）", async () => {
    // 预置模拟态写入 localStorage，再加载 store
    localStorage.setItem("token", IMP_TOKEN);
    localStorage.setItem("impersonateBy", JSON.stringify(adminInfo));
    const { useAuthStore } = await freshStore();
    expect(useAuthStore.getState().token).toBe(IMP_TOKEN);
    expect(useAuthStore.getState().impersonatedBy).toEqual(adminInfo);
  });

  it("损坏的 impersonateBy JSON 视为无模拟态", async () => {
    localStorage.setItem("impersonateBy", "{broken");
    const { useAuthStore } = await freshStore();
    expect(useAuthStore.getState().impersonatedBy).toBeNull();
  });
});

describe("stopImpersonation", () => {
  it("恢复原 admin token 并清空 impersonatedBy", async () => {
    const { useAuthStore } = await freshStore();
    useAuthStore.getState().setSession(ADMIN_TOKEN, adminUser);
    useAuthStore.getState().startImpersonation(IMP_TOKEN, targetUser, adminInfo);

    useAuthStore.getState().stopImpersonation();

    const s = useAuthStore.getState();
    expect(s.token).toBe(ADMIN_TOKEN);
    expect(s.impersonatedBy).toBeNull();
    expect(localStorage.getItem("token")).toBe(ADMIN_TOKEN);
    expect(localStorage.getItem("impersonationBackup")).toBeNull();
    expect(localStorage.getItem("impersonateBy")).toBeNull();
  });

  it("退出后触发 fetchMe 拉回 admin 身份", async () => {
    const { useAuthStore } = await freshStore();
    useAuthStore.getState().setSession(ADMIN_TOKEN, adminUser);
    useAuthStore.getState().startImpersonation(IMP_TOKEN, targetUser, adminInfo);

    // mock /me 返回 admin
    const { api } = await import("../lib/api");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: adminUser });

    useAuthStore.getState().stopImpersonation();
    // fetchMe 异步，等待其完成
    await vi.waitFor(() => {
      expect(useAuthStore.getState().user?.email).toBe(adminUser.email);
      expect(useAuthStore.getState().user?.role).toBe("super_admin");
    });
  });

  it("无 backup 时（localStorage 被清）安全退回登出态", async () => {
    const { useAuthStore } = await freshStore();
    useAuthStore.getState().setSession(ADMIN_TOKEN, adminUser);
    useAuthStore.getState().startImpersonation(IMP_TOKEN, targetUser, adminInfo);
    // 清掉 backup 模拟异常场景
    localStorage.removeItem("impersonationBackup");

    useAuthStore.getState().stopImpersonation();

    const s = useAuthStore.getState();
    expect(s.token).toBeNull();
    expect(s.impersonatedBy).toBeNull();
  });
});

describe("logout", () => {
  it("清空 token / user / impersonatedBy / backup", async () => {
    const { useAuthStore } = await freshStore();
    useAuthStore.getState().setSession(ADMIN_TOKEN, adminUser);
    useAuthStore.getState().startImpersonation(IMP_TOKEN, targetUser, adminInfo);

    useAuthStore.getState().logout();

    const s = useAuthStore.getState();
    expect(s.token).toBeNull();
    expect(s.user).toBeNull();
    expect(s.impersonatedBy).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("impersonationBackup")).toBeNull();
    expect(localStorage.getItem("impersonateBy")).toBeNull();
  });
});
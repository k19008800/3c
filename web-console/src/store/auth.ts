import { create } from "zustand";
import { api } from "../lib/api";

/**
 * 认证状态（zustand）
 * 管理 token + 当前用户 + 登录/登出
 */
export interface User {
  id: number;
  email: string;
  username: string | null;
  role: string;
  status: string;
  balance: number;
  realNameStatus: string | null;
}

/** 模拟发起者信息（admin）。null = 正常登录态。 */
export interface ImpersonatedBy {
  id: number;
  email: string;
}

/** localStorage 键名（键名自定，见 PRD §5） */
const LS_TOKEN = "token";
const LS_IMPERSONATE_BY = "impersonateBy";
/** 模拟期间保存原 admin 令牌，退出模拟时恢复 */
const LS_BACKUP = "impersonationBackup";

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  /** 模拟发起者；null = 正常登录态。存在即为「模拟态」。 */
  impersonatedBy: ImpersonatedBy | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  /**
   * 直接写入会话（token + 用户摘要）。
   * 用于 2FA 第二步 verify 与 OAuth 回调登录——这两处后端返回的
   * user 是摘要（id/email/name/role），完整字段由后续 fetchMe() 补齐，
   * 因此入参允许 Partial<User>。
   */
  setSession: (token: string, user: Partial<User> | null) => void;
  /**
   * 以用户身份模拟登录（Impersonation）。
   * 把「当前 admin 的 accessToken」存入内部 backup（不得丢失/覆盖），
   * 再写入模拟 token + 目标 user + impersonatedBy。
   */
  startImpersonation: (token: string, user: User, adminInfo: ImpersonatedBy) => void;
  /**
   * 退出模拟：恢复 backup 里的 admin token，清空 impersonatedBy，
   * 并触发 fetchMe() 拉回 admin 身份。
   */
  stopImpersonation: () => void;
}

function readToken(): string | null {
  return localStorage.getItem(LS_TOKEN);
}

function readImpersonatedBy(): ImpersonatedBy | null {
  const raw = localStorage.getItem(LS_IMPERSONATE_BY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "number" && typeof parsed.email === "string") {
      return { id: parsed.id, email: parsed.email };
    }
  } catch {
    /* 损坏则视为无模拟态 */
  }
  return null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: readToken(),
  user: null,
  loading: false,
  impersonatedBy: readImpersonatedBy(),

  login: async (email, password) => {
    const res = await api.post<{ user: User; accessToken: string }>("/auth/login", { email, password });
    const { accessToken, user } = res.data;
    localStorage.setItem(LS_TOKEN, accessToken);
    set({ token: accessToken, user, impersonatedBy: null });
  },

  logout: () => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_IMPERSONATE_BY);
    localStorage.removeItem(LS_BACKUP);
    set({ token: null, user: null, impersonatedBy: null });
  },

  setSession: (token, user) => {
    localStorage.setItem(LS_TOKEN, token);
    // 摘要用户对象在 fetchMe 前可能缺字段，先按 User 落位，App.tsx 侦测 token 变化后 fetchMe 补齐
    set({ token, user: user as User | null });
  },

  fetchMe: async () => {
    set({ loading: true });
    try {
      const res = await api.get<User>("/me");
      set({ user: res.data, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  startImpersonation: (token, user, adminInfo) => {
    // 1) 保存当前 admin token 到内部 backup（仅在无 backup 时不覆盖，避免嵌套模拟丢失）
    const currentToken = localStorage.getItem(LS_TOKEN);
    if (currentToken && !localStorage.getItem(LS_BACKUP)) {
      localStorage.setItem(LS_BACKUP, currentToken);
    }
    // 2) 写入模拟 token + 目标 user + impersonatedBy
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_IMPERSONATE_BY, JSON.stringify(adminInfo));
    set({ token, user, impersonatedBy: adminInfo });
  },

  stopImpersonation: () => {
    // 1) 恢复 backup 里的 admin token
    const adminToken = localStorage.getItem(LS_BACKUP);
    // 无论是否有 backup，都清空模拟标记
    localStorage.removeItem(LS_IMPERSONATE_BY);
    localStorage.removeItem(LS_BACKUP);
    if (adminToken) {
      localStorage.setItem(LS_TOKEN, adminToken);
      set({ token: adminToken, impersonatedBy: null, user: null });
    } else {
      // 极端情况无 backup（如 localStroage 被清）——退回登出
      localStorage.removeItem(LS_TOKEN);
      set({ token: null, impersonatedBy: null, user: null });
    }
    // 2) 拉回 admin 身份
    get().fetchMe();
  },
}));
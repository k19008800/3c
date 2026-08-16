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

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
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
}

function readToken(): string | null {
  return localStorage.getItem("token");
}

export const useAuthStore = create<AuthState>((set) => ({
  token: readToken(),
  user: null,
  loading: false,

  login: async (email, password) => {
    const res = await api.post<{ user: User; accessToken: string }>("/auth/login", { email, password });
    const { accessToken, user } = res.data;
    localStorage.setItem("token", accessToken);
    set({ token: accessToken, user });
  },

  logout: () => {
    localStorage.removeItem("token");
    set({ token: null, user: null });
  },

  setSession: (token, user) => {
    localStorage.setItem("token", token);
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
}));

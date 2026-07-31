import { create } from "zustand";
import { api } from "../lib/api";

/**
 * 认证状态（zustand）
 * 管理 token + 当前用户 + 登录/登出
 */
interface User {
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
}

function readToken(): string | null {
  return localStorage.getItem("token");
}

export const useAuthStore = create<AuthState>((set) => ({
  token: readToken(),
  user: null,
  loading: false,

  login: async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    const { token, user } = res.data;
    localStorage.setItem("token", token);
    set({ token, user });
  },

  logout: () => {
    localStorage.removeItem("token");
    set({ token: null, user: null });
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

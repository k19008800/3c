import { create } from "zustand";

/**
 * 供应商自助认证状态（zustand，独立于用户侧 store）
 * 管理供应商 token + 登录/登出
 */

interface VendorAuthState {
  token: string | null;
  vendor: { id: number; name: string; status: string; contact_email: string } | null;
  vendorLogin: (email: string, password: string) => Promise<void>;
  vendorLogout: () => void;
}

function readToken(): string | null {
  return localStorage.getItem("vendor_token");
}

export const useVendorAuthStore = create<VendorAuthState>((set) => ({
  token: readToken(),
  vendor: null,

  vendorLogin: async (email, password) => {
    const res = await fetch("/api/v1/vendor/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.status !== 200) {
      const msg = data?.message ?? "登录失败";
      if (data?.code === "PENDING") throw new Error(msg);
      if (data?.code === "REJECTED") throw new Error(msg);
      throw new Error(msg);
    }
    const { token, vendor } = data.data;
    localStorage.setItem("vendor_token", token);
    set({ token, vendor });
  },

  vendorLogout: () => {
    localStorage.removeItem("vendor_token");
    set({ token: null, vendor: null });
  },
}));

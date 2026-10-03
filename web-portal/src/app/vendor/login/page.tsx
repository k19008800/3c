"use client";

// 渠道自助门户登录页 — /vendor/login（SPEC §25 渠道方自助登录）
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHelp } from "../../../components/Help";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

export default function VendorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/vendor/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? "登录失败，请重试");
        return;
      }
      localStorage.setItem("vendor_token", body.data.token);
      localStorage.setItem("vendor_info", JSON.stringify(body.data.vendor));
      router.push("/vendor/dashboard");
    } catch {
      setError("无法连接服务器，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section container" style={{ maxWidth: 440, margin: "0 auto" }}>
      <h1 style={{ display: "inline-flex", alignItems: "center" }}>
        渠道登录
        <PageHelp text="渠道方（供应商）自助门户登录。使用平台分配的邮箱与密码登录，登录后可查看本渠道的结算单、申请自助结算、接收平台公告并查看接入模型。\n\n· 账号由平台开通，忘记密码请联系平台运营\n· 本门户与用户账号体系相互独立" />
      </h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 24 }}>浩寅云 · 渠道自助门户</p>

      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
          邮箱
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          />
        </label>
        {error && <div style={{ color: "var(--color-danger, #d33)", fontSize: 13 }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{ padding: "11px 12px", borderRadius: 8, border: "none", background: "var(--color-primary, #4f6ef7)", color: "#fff", fontSize: 15, cursor: "pointer" }}
        >
          {loading ? "登录中…" : "登 录"}
        </button>
      </form>
    </section>
  );
}

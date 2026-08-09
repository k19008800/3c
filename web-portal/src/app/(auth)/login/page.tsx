"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const styles = {
  page: { display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#f0f2f5", padding: 24 } as const,
  container: { width: 420, background: "#fff", borderRadius: 16, padding: "40px 32px", boxShadow: "0 2px 16px rgba(0,0,0,0.08)" } as const,
  logo: { textAlign: "center", marginBottom: 32 } as const,
  logoH1: { fontSize: 24, color: "#1a1a1a", fontWeight: 700 } as const,
  logoP: { fontSize: 14, color: "#888", marginTop: 4 } as const,
  title: { fontSize: 18, fontWeight: 600, color: "#1a1a1a", marginBottom: 24 } as const,
  formGroup: { marginBottom: 16 } as const,
  label: { display: "block", fontSize: 13, color: "#333", marginBottom: 6 } as const,
  required: { color: "#e53935", marginLeft: 2 } as const,
  input: { width: "100%", height: 40, border: "1px solid #d9d9d9", borderRadius: 8, padding: "0 12px", fontSize: 14, outline: "none" } as const,
  forgotLink: { float: "right", fontSize: 13, color: "#4f6ef7", textDecoration: "none", cursor: "pointer", marginTop: 4 } as const,
  submitBtn: { width: "100%", height: 44, background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, cursor: "pointer", marginTop: 8, fontWeight: 600 } as const,
  disabled: { background: "#a0b4f9", cursor: "not-allowed" } as const,
  error: { display: "flex", alignItems: "center", gap: 8, background: "#fff1f0", border: "1px solid #ffccc7", borderRadius: 6, padding: "10px 12px", fontSize: 13, color: "#cf1322", marginBottom: 16 } as const,
  footer: { textAlign: "center", marginTop: 20, fontSize: 13, color: "#888" } as const,
  link: { color: "#4f6ef7", textDecoration: "none", cursor: "pointer" } as const,
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = useCallback(async () => {
    if (loading) return;
    if (!email.trim()) { setError("请输入邮箱地址"); return; }
    if (!password.trim()) { setError("请输入密码"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.accessToken) {
        localStorage.setItem("token", data.accessToken);
        const role = data.user?.role;
        if (data.user?.totpEnabled) {
          router.push("/2fa");
        } else if (role === "admin" || role === "super_admin" || role === "agent") {
          window.location.href = "/app/";
        } else {
          window.location.href = "/dashboard";
        }
      } else {
        setError(data.message || "邮箱或密码错误");
      }
    } catch {
      setError("网络异常，请稍后再试");
    } finally {
      setLoading(false);
    }
  }, [email, password, loading, router]);

  return (
    <div style={styles.page as any}>
      <div style={styles.container as any}>
        <div style={styles.logo as any}>
          <h1 style={styles.logoH1 as any}>🚀 3Cloud</h1>
          <p style={styles.logoP as any}>AI Token 聚合平台</p>
        </div>
        <div style={styles.title as any}>登录</div>
        {error && <div style={styles.error as any}>❌ {error}</div>}
        <div style={styles.formGroup as any}>
          <label style={styles.label as any}>邮箱 <span style={styles.required as any}>*</span></label>
          <input type="email" placeholder="your@email.com" value={email}
            onChange={e => { setEmail(e.target.value); setError(""); }} style={styles.input as any} />
        </div>
        <div style={styles.formGroup as any}>
          <label style={styles.label as any}>密码 <span style={styles.required as any}>*</span></label>
          <input type="password" placeholder="请输入密码" value={password}
            onChange={e => { setPassword(e.target.value); setError(""); }} style={styles.input as any}
            onKeyDown={e => { if (e.key === "Enter") handleLogin(); }} />
          <a style={styles.forgotLink as any} onClick={() => router.push("/forgot-password")}>忘记密码？</a>
        </div>
        <button style={{ ...styles.submitBtn, ...(loading ? styles.disabled : {}) } as any}
          onClick={handleLogin} disabled={loading}>
          {loading ? "登录中…" : "登录"}
        </button>
        <div style={styles.footer as any}>
          还没有账号？<a href="/register" style={styles.link as any}>立即注册</a>
        </div>
      </div>
    </div>
  );
}

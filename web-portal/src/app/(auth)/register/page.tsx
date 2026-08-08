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
  strength: { display: "flex", gap: 4, marginTop: 6 } as const,
  bar: { flex: 1, height: 4, borderRadius: 2, background: "#eee" } as const,
  strengthText: { fontSize: 12, color: "#888", marginTop: 4 } as const,
  submitBtn: { width: "100%", height: 44, background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, cursor: "pointer", marginTop: 8, fontWeight: 600 } as const,
  disabled: { background: "#a0b4f9", cursor: "not-allowed" } as const,
  error: { display: "flex", alignItems: "center", gap: 8, background: "#fff1f0", border: "1px solid #ffccc7", borderRadius: 6, padding: "10px 12px", fontSize: 13, color: "#cf1322", marginBottom: 16 } as const,
  footer: { textAlign: "center", marginTop: 20, fontSize: 13, color: "#888" } as const,
  link: { color: "#4f6ef7", textDecoration: "none", cursor: "pointer" } as const,
  success: { textAlign: "center", padding: "20px 0" } as const,
};

function getPasswordStrength(pwd: string) {
  if (!pwd) return { level: 0, label: "弱", color: "#e53935" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^a-zA-Z\d]/.test(pwd)) score++;
  if (score <= 1) return { level: score, label: "弱", color: "#e53935" };
  if (score <= 2) return { level: score, label: "中等", color: "#f59e0b" };
  return { level: score, label: "强", color: "#22c55e" };
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const strength = getPasswordStrength(password);

  const handleRegister = useCallback(async () => {
    if (loading) return;
    if (!email.trim()) { setError("请输入邮箱地址"); return; }
    if (password.length < 8) { setError("密码长度至少为 8 位"); return; }
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password) || !/[^a-zA-Z\d]/.test(password)) {
      setError("密码需包含字母、数字和特殊字符"); return;
    }
    if (password !== confirm) { setError("两次输入的密码不一致"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, username: email.split("@")[0] }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.message || "注册失败，请稍后再试");
      }
    } catch {
      setError("网络异常，请稍后再试");
    } finally {
      setLoading(false);
    }
  }, [email, password, confirm, loading]);

  if (success) {
    return (
      <div style={styles.page as any}>
        <div style={styles.container as any}>
          <div style={styles.logo as any}>
            <h1 style={styles.logoH1 as any}>🚀 3Cloud</h1>
            <p style={styles.logoP as any}>AI Token 聚合平台</p>
          </div>
          <div style={styles.success as any}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>注册成功！</div>
            <div style={{ fontSize: 14, color: "#888", lineHeight: 1.6 }}>
              已发送激活链接至<br />
              <strong style={{ color: "#333" }}>{email}</strong>
            </div>
            <button style={{ ...styles.submitBtn, width: "auto", padding: "0 32px", marginTop: 16 } as any}
              onClick={() => router.push("/login")}>前往登录</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page as any}>
      <div style={styles.container as any}>
        <div style={styles.logo as any}>
          <h1 style={styles.logoH1 as any}>🚀 3Cloud</h1>
          <p style={styles.logoP as any}>AI Token 聚合平台</p>
        </div>
        <div style={styles.title as any}>注册账号</div>
        {error && <div style={styles.error as any}>❌ {error}</div>}
        <div style={styles.formGroup as any}>
          <label style={styles.label as any}>邮箱 <span style={styles.required as any}>*</span></label>
          <input type="email" placeholder="your@email.com" value={email}
            onChange={e => { setEmail(e.target.value); setError(""); }} style={styles.input as any} />
        </div>
        <div style={styles.formGroup as any}>
          <label style={styles.label as any}>密码 <span style={styles.required as any}>*</span></label>
          <input type="password" placeholder="≥8位，字母+数字+特殊字符" value={password}
            onChange={e => { setPassword(e.target.value); setError(""); }} style={styles.input as any} />
          <div style={styles.strength as any}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ ...styles.bar, background: i <= strength.level ? strength.color : "#eee" }} />
            ))}
          </div>
          <div style={styles.strengthText as any}>密码强度：{strength.label}</div>
        </div>
        <div style={styles.formGroup as any}>
          <label style={styles.label as any}>确认密码 <span style={styles.required as any}>*</span></label>
          <input type="password" placeholder="再次输入密码" value={confirm}
            onChange={e => { setConfirm(e.target.value); setError(""); }} style={styles.input as any}
            onKeyDown={e => { if (e.key === "Enter") handleRegister(); }} />
        </div>
        <button style={{ ...styles.submitBtn, ...(loading ? styles.disabled : {}) } as any}
          onClick={handleRegister} disabled={loading}>
          {loading ? "注册中…" : "注册"}
        </button>
        <div style={styles.footer as any}>
          已有账号？<a href="/login" style={styles.link as any}>立即登录</a>
        </div>
      </div>
    </div>
  );
}

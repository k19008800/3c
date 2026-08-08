/**
 * LoginPage — 生产服登录页（对接真实 Auth API）
 */
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

/* ==================== Styles ==================== */
const styles = {
  container: {
    width: 420,
    background: "#fff",
    borderRadius: 16,
    padding: "40px 32px",
    boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
  } as const,
  logo: { textAlign: "center", marginBottom: 32 } as const,
  logoTitle: { fontSize: 28, color: "#1a1a1a", fontWeight: 700 } as const,
  logoSub: { fontSize: 14, color: "#64748b", marginTop: 4 } as const,
  tabs: { display: "flex", borderBottom: "1px solid #e2e8f0", marginBottom: 24 } as const,
  tab: (active: boolean) => ({
    flex: 1, padding: 10, textAlign: "center", fontSize: 14,
    fontWeight: active ? 600 : 400,
    color: active ? "#2563eb" : "#64748b",
    cursor: "pointer", background: "none", border: "none",
    borderBottom: active ? "2px solid #2563eb" : "2px solid transparent",
    transition: "all 0.2s",
  } as const),
  formGroup: { marginBottom: 16 } as const,
  label: { display: "block", fontSize: 13, color: "#334155", marginBottom: 6 } as const,
  required: { color: "#ef4444", marginLeft: 2 } as const,
  input: {
    width: "100%", height: 40, border: "1px solid #cbd5e1", borderRadius: 8,
    padding: "0 12px", fontSize: 14, outline: "none", background: "#fff",
    color: "#0f172a", transition: "border 0.2s",
  } as const,
  submitBtn: {
    width: "100%", height: 44, background: "#2563eb", color: "#fff",
    border: "none", borderRadius: 8, fontSize: 15, cursor: "pointer",
    marginTop: 8, fontWeight: 600, transition: "background 0.2s",
  } as const,
  submitBtnDisabled: { background: "#a0b4f9", cursor: "not-allowed" } as const,
  errorMsg: {
    display: "flex", alignItems: "center", gap: 8, background: "#fef2f2",
    border: "1px solid #fecaca", borderRadius: 8, padding: "10px 12px",
    fontSize: 13, color: "#dc2626", marginBottom: 16,
  } as const,
  successMsg: {
    textAlign: "center", padding: "20px 0",
  } as const,
  footerLinks: {
    textAlign: "center", marginTop: 20, fontSize: 13, color: "#64748b",
  } as const,
  link: {
    color: "#2563eb", textDecoration: "none", cursor: "pointer",
    background: "none", border: "none", fontSize: 13,
  } as const,
};

/* ==================== Component ==================== */
export default function LoginPage() {
  const router = useRouter();

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Register
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState(false);

  // Track login failures locally (UI only, actual lock is server-side)
  const [loginFailCount, setLoginFailCount] = useState(0);
  const MAX_LOGIN_FAILURES = 5;

  const handleLogin = useCallback(async () => {
    if (loginLoading) return;
    if (!email.trim()) { setLoginError("请输入邮箱地址"); return; }
    if (!password.trim()) { setLoginError("请输入密码"); return; }

    setLoginLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();

      if (res.ok && data.token) {
        // 存 token 到 localStorage
        localStorage.setItem("token", data.token);
        const user = data.user ?? {};
        if (user.totpEnabled) {
          router.push("/2fa");
        } else {
          router.push("/dashboard");
        }
      } else {
        const newCount = loginFailCount + 1;
        setLoginFailCount(newCount);
        const attempts = MAX_LOGIN_FAILURES - newCount;
        if (newCount >= MAX_LOGIN_FAILURES) {
          setLoginError(`账号已锁定：连续 ${MAX_LOGIN_FAILURES} 次登录失败。请稍后再试或重置密码。`);
        } else {
          setLoginError(data.message || `邮箱或密码错误，还剩 ${attempts} 次尝试机会`);
        }
      }
    } catch {
      setLoginError("网络异常，请稍后再试");
    } finally {
      setLoginLoading(false);
    }
  }, [email, password, loginLoading, loginFailCount, router]);

  const handleRegister = useCallback(async () => {
    if (regLoading) return;
    if (!regEmail.trim()) { setRegError("请输入邮箱地址"); return; }
    if (regPassword.length < 8) { setRegError("密码长度至少为 8 位"); return; }
    if (!/[a-zA-Z]/.test(regPassword) || !/\d/.test(regPassword) || !/[^a-zA-Z\d]/.test(regPassword)) {
      setRegError("密码需包含字母、数字和特殊字符"); return;
    }
    if (regPassword !== regConfirm) { setRegError("两次输入的密码不一致"); return; }

    setRegLoading(true);
    setRegError("");

    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regEmail.trim(), password: regPassword }),
      });
      const data = await res.json();

      if (res.ok) {
        setRegSuccess(true);
      } else {
        setRegError(data.message || "注册失败，请稍后再试");
      }
    } catch {
      setRegError("网络异常，请稍后再试");
    } finally {
      setRegLoading(false);
    }
  }, [regEmail, regPassword, regConfirm, regLoading]);

  const handleForgotPassword = useCallback(() => {
    router.push("/forgot-password");
  }, [router]);

  const switchToRegister = useCallback(() => {
    setLoginError("");
    setRegError("");
  }, []);

  const switchToLogin = useCallback(() => {
    setLoginError("");
    setRegError("");
  }, []);

  const locked = loginFailCount >= MAX_LOGIN_FAILURES;

  // ===== Register success view =====
  if (regSuccess) {
    return (
      <div style={styles.container as any}>
        <div style={styles.logo as any}>
          <h1 style={styles.logoTitle as any}>🚀 3Cloud</h1>
          <p style={styles.logoSub as any}>AI Token 聚合平台</p>
        </div>
        <div style={styles.successMsg as any}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>注册成功！</div>
          <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
            已发送激活链接至<br />
            <strong style={{ color: "#0f172a" }}>{regEmail}</strong>
            <br /><br />
            请前往邮箱点击链接完成激活
          </div>
          <button style={{ ...(styles.submitBtn as any), width: "auto", padding: "0 32px", marginTop: 16 }}
            onClick={() => { setRegSuccess(false); setTab("login"); }}>
            前往登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container as any}>
      <div style={styles.logo as any}>
        <h1 style={styles.logoTitle as any}>🚀 3Cloud</h1>
        <p style={styles.logoSub as any}>AI Token 聚合平台</p>
      </div>

      {/* ===== Login ===== */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1a1a1a" }}>登录</h2>
      </div>

      {loginError && (
        <div style={styles.errorMsg as any}>❌ {loginError}</div>
      )}

      <div style={styles.formGroup as any}>
        <label style={styles.label as any}>邮箱 <span style={styles.required as any}>*</span></label>
        <input type="email" placeholder="your@email.com" value={email}
          onChange={(e) => { setEmail(e.target.value); setLoginError(""); }}
          style={styles.input as any} disabled={locked} />
      </div>
      <div style={styles.formGroup as any}>
        <label style={styles.label as any}>密码 <span style={styles.required as any}>*</span></label>
        <input type="password" placeholder="请输入密码" value={password}
          onChange={(e) => { setPassword(e.target.value); setLoginError(""); }}
          style={styles.input as any} disabled={locked}
          onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }} />
        <a onClick={handleForgotPassword} style={{ float: "right", fontSize: 12, color: "#2563eb", cursor: "pointer", marginTop: 4, textDecoration: "none" }}>
          忘记密码？
        </a>
      </div>

      <button style={{ ...(styles.submitBtn as any), ...(loginLoading || locked ? styles.submitBtnDisabled : {}) }}
        onClick={handleLogin} disabled={loginLoading || locked}>
        {loginLoading ? "登录中…" : locked ? `锁定中(${loginFailCount}次失败)` : "登录"}
      </button>

      {/* ===== Register ===== */}
      <div style={{ margin: "32px 0 16px" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1a1a1a" }}>注册账号</h2>
      </div>

      {regError && (
        <div style={styles.errorMsg as any}>❌ {regError}</div>
      )}

      <div style={styles.formGroup as any}>
        <label style={styles.label as any}>邮箱 <span style={styles.required as any}>*</span></label>
        <input type="email" placeholder="your@email.com" value={regEmail}
          onChange={(e) => { setRegEmail(e.target.value); setRegError(""); }}
          style={styles.input as any} />
      </div>
      <div style={styles.formGroup as any}>
        <label style={styles.label as any}>密码 <span style={styles.required as any}>*</span></label>
        <input type="password" placeholder="≥8位，字母+数字+特殊字符" value={regPassword}
          onChange={(e) => { setRegPassword(e.target.value); setRegError(""); }}
          style={styles.input as any} />
      </div>
      <div style={styles.formGroup as any}>
        <label style={styles.label as any}>确认密码 <span style={styles.required as any}>*</span></label>
        <input type="password" placeholder="再次输入密码" value={regConfirm}
          onChange={(e) => { setRegConfirm(e.target.value); setRegError(""); }}
          style={styles.input as any}
          onKeyDown={(e) => { if (e.key === "Enter") handleRegister(); }} />
      </div>
      <button style={{ ...(styles.submitBtn as any), ...(regLoading ? styles.submitBtnDisabled : {}) }}
        onClick={handleRegister} disabled={regLoading}>
        {regLoading ? "注册中…" : "注册"}
      </button>
    </div>
  );
}

// Dummy to satisfy old state variable references below
function setTab(_tab: string) {}

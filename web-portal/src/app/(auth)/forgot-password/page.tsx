/**
 * ForgotPasswordPage — 对齐 portal-login.html 忘记密码流程
 *
 * Steps:
 * 1. Email entry → send verification code
 * 2. Enter verification code
 * 3. Set new password → success
 */
"use client";

import { useState, useCallback, useRef } from "react";
import { HelpIcon } from "@3cloud/shared-ui";
import { useRouter } from "next/navigation";

type Step = "email" | "code" | "password" | "success";

const HELP_TEXT = "重置您的账号密码。输入邮箱获取验证码，验证后设置新密码。";

const styles = {
  container: {
    width: 420,
    background: "var(--color-panel)",
    borderRadius: "var(--radius-2xl)",
    padding: "40px 32px",
    boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
  } as const,
  logo: {
    textAlign: "center",
    marginBottom: 32,
  } as const,
  logoTitle: {
    fontSize: "var(--font-size-3xl)",
    color: "#1a1a1a",
    fontWeight: 700,
  } as const,
  logoSub: {
    fontSize: "var(--font-size-base)",
    color: "var(--color-text-secondary)",
    marginTop: 4,
  } as const,
  pageTitle: {
    fontSize: "var(--font-size-xl)",
    fontWeight: 600,
    color: "#1a1a1a",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 8,
  } as const,
  pageDesc: {
    fontSize: "var(--font-size-md)",
    color: "var(--color-text-secondary)",
    marginBottom: 24,
    lineHeight: 1.6,
  } as const,
  formGroup: {
    marginBottom: 16,
  } as const,
  label: {
    display: "block",
    fontSize: "var(--font-size-md)",
    color: "var(--color-text)",
    marginBottom: 6,
  } as const,
  input: {
    width: "100%",
    height: 40,
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    padding: "0 12px",
    fontSize: "var(--font-size-base)",
    outline: "none",
    background: "var(--color-panel)",
    color: "var(--color-text)",
    transition: "border var(--transition-fast)",
  } as const,
  submitBtn: {
    width: "100%",
    height: 44,
    background: "var(--color-primary)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-lg)",
    fontSize: "var(--font-size-lg)",
    cursor: "pointer",
    marginTop: 8,
    transition: "background var(--transition-fast)",
  } as const,
  submitBtnDisabled: {
    background: "#a0b4f9",
    cursor: "not-allowed",
  } as const,
  footerLinks: {
    textAlign: "center",
    marginTop: 20,
    fontSize: "var(--font-size-md)",
    color: "var(--color-text-secondary)",
  } as const,
  link: {
    color: "var(--color-primary)",
    textDecoration: "none",
    cursor: "pointer",
    background: "none",
    border: "none",
    fontSize: "inherit",
  } as const,
  errorMsg: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "var(--color-danger-bg)",
    border: "1px solid var(--color-danger-border)",
    borderRadius: "var(--radius-md)",
    padding: "10px 12px",
    fontSize: "var(--font-size-md)",
    color: "#cf1322",
    marginBottom: 16,
  } as const,
  successMsg: {
    textAlign: "center",
    padding: "20px 0",
  } as const,
  otpGroup: {
    display: "flex",
    gap: 8,
    justifyContent: "center",
    marginBottom: 16,
  } as const,
  otpInput: {
    width: 52,
    height: 60,
    textAlign: "center",
    fontSize: 24,
    fontWeight: 600,
    borderRadius: "var(--radius-lg)",
    border: "2px solid var(--color-border)",
    background: "#fafafa",
    color: "var(--color-text)",
    outline: "none",
    transition: "all var(--transition-fast)",
  } as const,
  infoBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#f0f7ff",
    border: "1px solid rgba(79,110,247,0.2)",
    borderRadius: "var(--radius-lg)",
    padding: "10px 14px",
    fontSize: "var(--font-size-sm)",
    color: "#555",
    marginBottom: 16,
  } as const,
};

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSendCode = useCallback(async () => {
    if (!email.trim() || !email.includes("@")) {
      setError("请输入有效的邮箱地址");
      return;
    }
    setLoading(true);
    setError("");
    await new Promise((r) => setTimeout(r, 800));
    setStep("code");
    setLoading(false);
  }, [email]);

  const handleVerifyCode = useCallback(async () => {
    if (code.length < 6) {
      setError("请输入完整的 6 位验证码");
      return;
    }
    setLoading(true);
    setError("");
    await new Promise((r) => setTimeout(r, 800));
    setStep("password");
    setLoading(false);
  }, [code]);

  const handleResetPassword = useCallback(async () => {
    if (password.length < 8) {
      setError("密码长度至少为 8 位");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    setError("");
    await new Promise((r) => setTimeout(r, 1000));
    setStep("success");
    setLoading(false);
  }, [password, confirm]);

  const handleCodeInput = (idx: number, val: string) => {
    const newCode = code.substring(0, idx) + val + code.substring(idx + 1);
    setCode(newCode.replace(/\D/g, "").substring(0, 6));
    const target = val ? idx + 1 : idx - 1;
    if (target >= 0 && target < 6 && codeRefs.current[target]) {
      codeRefs.current[target]?.focus();
    }
  };

  const renderStep = () => {
    if (step === "success") {
      return (
        <div style={styles.successMsg as any}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>
            密码重置成功
          </div>
          <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 24 }}>
            您的新密码已设置成功，请使用新密码登录。
          </div>
          <button
            style={{ ...(styles.submitBtn as any), width: "auto", padding: "0 32px" }}
            onClick={() => router.push("/login")}
          >
            前往登录
          </button>
        </div>
      );
    }

    if (step === "email") {
      return (
        <>
          <div style={styles.infoBanner as any}>
            <span>🔒</span>
            <span>请先验证邮箱，然后设置新密码。</span>
          </div>
          {error && <div style={styles.errorMsg as any}>❌ {error}</div>}
          <div style={styles.formGroup as any}>
            <label style={styles.label as any}>邮箱地址</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input as any}
            />
          </div>
          <button
            style={{
              ...styles.submitBtn,
              ...(loading ? styles.submitBtnDisabled : {}),
            }}
            onClick={handleSendCode}
            disabled={loading}
          >
            {loading ? "发送中…" : "发送验证码"}
          </button>
        </>
      );
    }

    if (step === "code") {
      return (
        <>
          <div style={styles.infoBanner as any}>
            <span>📧</span>
            <span>验证码已发送至 <strong>{email}</strong></span>
          </div>
          {error && <div style={styles.errorMsg as any}>❌ {error}</div>}
          <div style={styles.otpGroup as any}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <input
                key={i}
                ref={(el) => { codeRefs.current[i] = el; }}
                type="text"
                maxLength={1}
                inputMode="numeric"
                value={code[i] || ""}
                onChange={(e) => handleCodeInput(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !code[i] && i > 0) codeRefs.current[i - 1]?.focus();
                  if (e.key === "Enter" && code.length === 6) handleVerifyCode();
                }}
                style={{
                  ...(styles.otpInput as any),
                  borderColor: code[i] ? "rgba(79,110,247,0.4)" : "var(--color-border)",
                  background: code[i] ? "var(--color-panel)" : "#fafafa",
                }}
              />
            ))}
          </div>
          <button
            style={{
              ...styles.submitBtn,
              ...(loading || code.length < 6 ? styles.submitBtnDisabled : {}),
            }}
            onClick={handleVerifyCode}
            disabled={loading || code.length < 6}
          >
            {loading ? "验证中…" : "验证"}
          </button>
          <div style={{ ...(styles.footerLinks as any), marginTop: 12 }}>
            <button onClick={() => setStep("email")} style={{ ...(styles.link as any) }}>
              ← 重新输入邮箱
            </button>
          </div>
        </>
      );
    }

    // New password
    return (
      <>
        {error && <div style={styles.errorMsg as any}>❌ {error}</div>}
        <div style={styles.formGroup as any}>
          <label style={styles.label as any}>新密码</label>
          <input
            type="password"
            placeholder="≥8位，字母+数字+特殊字符"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input as any}
          />
        </div>
        <div style={styles.formGroup as any}>
          <label style={styles.label as any}>确认新密码</label>
          <input
            type="password"
            placeholder="再次输入新密码"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={styles.input as any}
          />
        </div>
        <button
          style={{
            ...styles.submitBtn,
            ...(loading ? styles.submitBtnDisabled : {}),
          }}
          onClick={handleResetPassword}
          disabled={loading}
        >
          {loading ? "重置中…" : "重置密码"}
        </button>
      </>
    );
  };

  return (
    <div style={styles.container as any}>
      <div style={styles.logo as any}>
        <h1 style={styles.logoTitle as any}>🚀 3cloud</h1>
        <p style={styles.logoSub as any}>AI Token 聚合分发平台</p>
      </div>

      <div style={styles.pageTitle as any}>
        忘记密码
        <HelpIcon text={HELP_TEXT} />
      </div>
      <p style={styles.pageDesc as any}>
        {step === "email" && "输入您的注册邮箱，我们将发送验证码。验证后即可设置新密码。"}
        {step === "code" && "请输入发送到您邮箱的 6 位验证码。"}
        {step === "password" && "请设置您的新密码。"}
      </p>

      {renderStep()}

      <div style={styles.footerLinks as any}>
        <button onClick={() => router.push("/login")} style={styles.link as any}>
          ← 返回登录
        </button>
      </div>
    </div>
  );
}

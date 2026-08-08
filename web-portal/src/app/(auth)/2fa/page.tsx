/**
 * TwoFactorPage — 对齐 portal-oauth.html 2FA 流程
 *
 * Three verification methods:
 * 1. TOTP (Authenticator app) — 6-digit code
 * 2. Passkey (biometric/security key)
 * 3. Backup codes (10-char recovery)
 *
 * URL params:
 * - ?view=recovery — show recovery codes list (after 2FA setup)
 */
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { HelpIcon } from "@3cloud/shared-ui";
import { useRouter } from "next/navigation";

type Method = "totp" | "passkey" | "backup";

const HELP_TEXT = "输入动态验证码完成登录。支持 TOTP 验证器、Passkey 或恢复码。";

const styles = {
  container: {
    width: 440,
    background: "var(--color-panel)",
    borderRadius: "var(--radius-2xl)",
    padding: "40px 32px",
    boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
  } as const,
  logo: {
    textAlign: "center",
    marginBottom: 28,
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
    gap: 6,
  } as const,
  pageDesc: {
    fontSize: "var(--font-size-md)",
    color: "var(--color-text-secondary)",
    marginBottom: 24,
    lineHeight: 1.6,
  } as const,
  methodTabs: {
    display: "flex",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    overflow: "hidden",
    marginBottom: 24,
  } as const,
  methodTab: (active: boolean) => ({
    flex: 1,
    padding: "10px 0",
    textAlign: "center",
    fontSize: "var(--font-size-md)",
    color: active ? "#fff" : "var(--color-text-secondary)",
    background: active ? "var(--color-primary)" : "#fafafa",
    cursor: "pointer",
    border: "none",
    borderRight: "1px solid var(--color-border)",
    transition: "all var(--transition-fast)",
    fontWeight: active ? 500 : 400,
  } as const),
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
  } as const,
  errorMsg: {
    display: "none",
    textAlign: "center",
    background: "var(--color-danger-bg)",
    border: "1px solid var(--color-danger-border)",
    borderRadius: "var(--radius-md)",
    padding: "8px 12px",
    fontSize: "var(--font-size-md)",
    color: "#cf1322",
    marginBottom: 16,
  } as const,
  errorMsgShow: {
    display: "block",
  } as const,
  // TOTP
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
  totpHint: {
    textAlign: "center",
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-secondary)",
    marginBottom: 20,
  } as const,
  resendLink: {
    textAlign: "center",
    marginTop: 12,
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-secondary)",
  } as const,
  // Passkey
  passkeyArea: {
    textAlign: "center",
    padding: "32px 0",
  } as const,
  passkeyIcon: {
    width: 80,
    height: 80,
    margin: "0 auto 20px",
    background: "linear-gradient(135deg, #e8f5e9, #c8e6c9)",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 36,
  } as const,
  passkeyBtn: {
    width: "100%",
    height: 44,
    background: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-lg)",
    fontSize: "var(--font-size-lg)",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background var(--transition-fast)",
  } as const,
  // Success
  successView: {
    textAlign: "center",
    padding: "24px 0",
  } as const,
  // Backup
  backupGroup: {
    display: "flex",
    gap: 6,
    justifyContent: "center",
    marginBottom: 16,
  } as const,
  backupChar: {
    width: 28,
    height: 40,
    textAlign: "center",
    fontSize: 18,
    fontWeight: 600,
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    background: "#fafafa",
    color: "var(--color-text)",
    outline: "none",
    fontFamily: "var(--font-family-mono)",
    transition: "all var(--transition-fast)",
  } as const,
  backupSep: {
    display: "flex",
    alignItems: "center",
    color: "#bbb",
    fontSize: "var(--font-size-md)",
    fontWeight: 600,
    padding: "0 2px",
  } as const,
  backupHint: {
    textAlign: "center",
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-secondary)",
    marginBottom: 16,
  } as const,
  // Recovery codes
  recoveryView: {
    // handled in render
  } as const,
  recoveryBox: {
    background: "#fafafa",
    border: "1px solid var(--color-divider)",
    borderRadius: "var(--radius-lg)",
    padding: 16,
    marginBottom: 16,
  } as const,
  recoveryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "4px 16px",
  } as const,
  recoveryCode: {
    fontFamily: "var(--font-family-mono)",
    fontSize: "var(--font-size-md)",
    color: "var(--color-text)",
    padding: "4px 0",
    borderBottom: "1px dashed var(--color-divider-light)",
  } as const,
  saveWarning: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#fff8e1",
    border: "1px solid #ffe082",
    borderRadius: "var(--radius-md)",
    padding: "10px 12px",
    fontSize: "var(--font-size-sm)",
    color: "var(--color-warning-text)",
    marginBottom: 16,
  } as const,
  infoBanner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#f0f7ff",
    border: "1px solid rgba(79,110,247,0.2)",
    borderRadius: "var(--radius-lg)",
    padding: "10px 14px",
    marginBottom: 20,
    fontSize: "var(--font-size-sm)",
    color: "#555",
    lineHeight: 1.5,
  } as const,
};

const DUMMY_RECOVERY_CODES = [
  "A3B7C9E2", "F1K5M8P3", "X2Z6W4Q7",
  "H9J3L5N8", "D4G7R1T5", "B8C2E6F9",
  "K3M7P1S5", "W2X6Y8Z4", "Q5T9V1A7",
  "L4N8R3S6",
];

export default function TwoFactorPage() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("totp");
  const [view, setView] = useState<"verify" | "success" | "recovery">("verify");

  // TOTP
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState(false);
  const [totpLoading, setTotpLoading] = useState(false);
  const totpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Passkey
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  // Backup
  const [backupCode, setBackupCode] = useState("");
  const [backupError, setBackupError] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const backupRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get("view");
    if (viewParam === "recovery") setView("recovery");
    else if (viewParam === "passkey") setMethod("passkey");
    else if (viewParam === "backup") setMethod("backup");
  }, []);

  const switchMethod = useCallback((m: Method) => {
    setMethod(m);
    setTotpError(false);
    setBackupError(false);
  }, []);

  const handleTotpInput = (idx: number, val: string) => {
    const newCode = totpCode.substring(0, idx) + val + totpCode.substring(idx + 1);
    const clean = newCode.replace(/\D/g, "").substring(0, 6);
    setTotpCode(clean);
    setTotpError(false);
    const target = val ? idx + 1 : idx - 1;
    if (target >= 0 && target < 6 && totpRefs.current[target]) {
      totpRefs.current[target]?.focus();
    }
    if (clean.length === 6) setTimeout(() => verifyTotp(clean), 100);
  };

  const handleTotpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").substring(0, 6);
    for (let i = 0; i < totpRefs.current.length; i++) {
      if (i < pasted.length && totpRefs.current[i]) {
        totpRefs.current[i]!.value = pasted[i];
      }
    }
    setTotpCode(pasted);
    if (pasted.length >= 6) {
      const last = Math.min(pasted.length, 6) - 1;
      totpRefs.current[last >= 5 ? 5 : last]?.focus();
      setTimeout(() => verifyTotp(pasted), 100);
    }
  }, []);

  const verifyTotp = useCallback(async (code: string) => {
    if (code.length < 6 || totpLoading) return;
    setTotpLoading(true);
    setTotpError(false);
    await new Promise((r) => setTimeout(r, 1200));
    if (code.length === 6) {
      setView("success");
      setTimeout(() => router.push("/dashboard"), 2000);
    } else {
      setTotpError(true);
      setTotpCode("");
      totpRefs.current[0]?.focus();
    }
    setTotpLoading(false);
  }, [totpLoading, router]);

  const handlePasskey = useCallback(async () => {
    setPasskeyLoading(true);
    await new Promise((r) => setTimeout(r, 3000));
    setPasskeyLoading(false);
    setView("success");
    setTimeout(() => router.push("/dashboard"), 1000);
  }, [router]);

  const handleBackupInput = (idx: number, val: string) => {
    const newCode = backupCode.substring(0, idx) + val + backupCode.substring(idx + 1);
    const clean = newCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().substring(0, 10);
    setBackupCode(clean);
    setBackupError(false);
    const target = val ? idx + 1 : idx - 1;
    if (target >= 0 && target < 10 && backupRefs.current[target]) {
      backupRefs.current[target]?.focus();
    }
    if (clean.length === 10) setTimeout(() => verifyBackup(clean), 100);
  };

  const handleBackupPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().substring(0, 10);
    for (let i = 0; i < Math.min(pasted.length, 10); i++) {
      if (backupRefs.current[i]) backupRefs.current[i]!.value = pasted[i];
    }
    setBackupCode(pasted);
    if (pasted.length >= 10) setTimeout(() => verifyBackup(pasted), 100);
  }, []);

  const verifyBackup = useCallback(async (code: string) => {
    if (code.length < 10 || backupLoading) return;
    setBackupLoading(true);
    setBackupError(false);
    await new Promise((r) => setTimeout(r, 1500));
    setView("success");
    setBackupLoading(false);
  }, [backupLoading]);

  const copyAllCodes = useCallback(async () => {
    const text = DUMMY_RECOVERY_CODES.join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }, []);

  // Success view
  if (view === "success") {
    return (
      <div style={styles.container as any}>
        <div style={styles.successView as any}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>
            验证通过
          </div>
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", marginBottom: 24, lineHeight: 1.6 }}>
            身份验证成功，正在跳转到控制台…
          </div>
          <button
            style={{ ...(styles.submitBtn as any), width: "auto", padding: "0 32px" }}
            onClick={() => router.push("/dashboard")}
          >
            前往控制台
          </button>
        </div>
      </div>
    );
  }

  // Recovery codes view
  if (view === "recovery") {
    return (
      <div style={styles.container as any}>
        <div style={styles.successView as any}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🛡️</div>
          <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>
            两步验证已启用
          </div>
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 20 }}>
            请妥善保存以下恢复码。每个恢复码只能使用一次，丢失设备时可用恢复码登录。
          </div>
          <div style={styles.recoveryBox as any}>
            <div style={styles.recoveryGrid as any}>
              {DUMMY_RECOVERY_CODES.map((code, i) => (
                <div key={i} style={styles.recoveryCode as any}>
                  <span style={{ color: "#bbb", fontSize: 11 }}>{i + 1}. </span>
                  <strong style={{ letterSpacing: 1 }}>{code}</strong>
                </div>
              ))}
            </div>
          </div>
          <button
            style={{
              width: "100%",
              height: 36,
              background: "#f0f2f5",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              fontSize: "var(--font-size-md)",
              color: "#555",
              cursor: "pointer",
              marginBottom: 8,
            }}
            onClick={copyAllCodes}
          >
            📋 复制全部恢复码
          </button>
          <div style={styles.saveWarning as any}>
            <span>⚠️</span>
            <span>关闭后将无法再次查看完整恢复码，请务必立即保存</span>
          </div>
          <button
            style={{ ...(styles.submitBtn as any) }}
            onClick={() => router.push("/security")}
          >
            我已保存，返回设置
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container as any}>
      <div style={styles.logo as any}>
        <h1 style={styles.logoTitle as any}>🚀 3cloud</h1>
        <p style={styles.logoSub as any}>AI Token 聚合分发平台</p>
      </div>

      <div style={styles.pageTitle as any}>
        两步验证
        <HelpIcon text={HELP_TEXT} />
      </div>
      <p style={styles.pageDesc as any}>
        为保障账户安全，我们需要进行额外的身份验证。请输入您验证器中的 6 位验证码。
      </p>

      <div style={styles.infoBanner as any}>
        <span>🔒</span>
        <span>两步验证已启用。请选择验证方式完成登录。</span>
      </div>

      {/* Method Tabs */}
      <div style={styles.methodTabs as any}>
        <button style={styles.methodTab(method === "totp")} onClick={() => switchMethod("totp")}>
          📱 TOTP 验证
        </button>
        <button style={styles.methodTab(method === "passkey")} onClick={() => switchMethod("passkey")}>
          🔑 Passkey
        </button>
        <button style={styles.methodTab(method === "backup")} onClick={() => switchMethod("backup")}>
          🛡️ 恢复码
        </button>
      </div>

      {/* TOTP Section */}
      {method === "totp" && (
        <>
          <div style={styles.otpGroup as any} onPaste={handleTotpPaste}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <input
                key={i}
                ref={(el) => { totpRefs.current[i] = el; }}
                type="text"
                maxLength={1}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totpCode[i] || ""}
                onChange={(e) => handleTotpInput(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !totpCode[i] && i > 0) totpRefs.current[i - 1]?.focus();
                  if (e.key === "Enter" && totpCode.length === 6) verifyTotp(totpCode);
                }}
                onFocus={(e) => e.target.select()}
                style={{
                  ...(styles.otpInput as any),
                  borderColor: totpCode[i]
                    ? totpError ? "var(--color-danger-text)" : "rgba(79,110,247,0.4)"
                    : "var(--color-border)",
                  background: totpCode[i] ? (totpError ? "#fff5f5" : "var(--color-panel)") : "#fafafa",
                }}
              />
            ))}
          </div>
          <div style={styles.totpHint as any}>
            打开 Google Authenticator / Authy 查看验证码
          </div>
          <div style={{
            ...(styles.errorMsg as any),
            ...(totpError ? styles.errorMsgShow : {}),
          } as any}>
            ❌ 验证码错误，请重新输入
          </div>
          <button
            style={{
              ...styles.submitBtn,
              ...(totpCode.length < 6 || totpLoading ? styles.submitBtnDisabled : {}),
            }}
            onClick={() => verifyTotp(totpCode)}
            disabled={totpCode.length < 6 || totpLoading}
          >
            {totpLoading ? "验证中…" : "验证"}
          </button>
          <div style={styles.resendLink as any}>
            <span>无法使用验证器？</span>
            <a style={styles.link as any} onClick={() => switchMethod("backup")}>使用恢复码</a>
          </div>
        </>
      )}

      {/* Passkey Section */}
      {method === "passkey" && (
        <>
          {passkeyLoading ? (
            <div style={{ textAlign: "center", padding: "20px 0" } as any}>
              <div style={{
                width: 32, height: 32, border: "3px solid #e0e0e0",
                borderTopColor: "var(--color-primary)", borderRadius: "50%",
                animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
              }} />
              <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)" }}>
                等待设备验证中…<br/>请使用指纹、面容或触摸安全密钥
              </div>
            </div>
          ) : (
            <div style={styles.passkeyArea as any}>
              <div style={{ ...(styles.passkeyIcon as any), background: "linear-gradient(135deg, #e8f5e9, #c8e6c9)" }}>🔐</div>
              <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)", marginBottom: 8 }}>
                使用 Passkey 登录
              </div>
              <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 20 }}>
                支持指纹、面容或安全密钥验证<br />无需密码，一键安全登录
              </div>
              <button style={styles.passkeyBtn as any} onClick={handlePasskey}>
                立即验证 Passkey
              </button>
            </div>
          )}
        </>
      )}

      {/* Backup Section */}
      {method === "backup" && (
        <>
          <div style={styles.backupHint as any}>
            请输入您的 10 位恢复码（使用后将失效）
          </div>
          <div style={styles.backupGroup as any} onPaste={handleBackupPaste}>
            {[0, 1, 2, 3, 4].map((i) => (
              <input
                key={`b${i}`}
                ref={(el) => { backupRefs.current[i] = el; }}
                type="text"
                maxLength={1}
                autoComplete="off"
                value={backupCode[i] || ""}
                onChange={(e) => handleBackupInput(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !backupCode[i] && i > 0) backupRefs.current[i - 1]?.focus();
                  if (e.key === "Enter" && backupCode.length === 10) verifyBackup(backupCode);
                }}
                onFocus={(e) => e.target.select()}
                style={{
                  ...(styles.backupChar as any),
                  borderColor: backupCode[i] ? "rgba(79,110,247,0.4)" : "var(--color-border)",
                  background: backupCode[i] ? "var(--color-panel)" : "#fafafa",
                }}
              />
            ))}
            <span style={styles.backupSep as any}>—</span>
            {[5, 6, 7, 8, 9].map((i) => (
              <input
                key={`b${i}`}
                ref={(el) => { backupRefs.current[i] = el; }}
                type="text"
                maxLength={1}
                autoComplete="off"
                value={backupCode[i] || ""}
                onChange={(e) => handleBackupInput(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !backupCode[i] && i > 5) backupRefs.current[i - 1]?.focus();
                  if (e.key === "Enter" && backupCode.length === 10) verifyBackup(backupCode);
                }}
                onFocus={(e) => e.target.select()}
                style={{
                  ...(styles.backupChar as any),
                  borderColor: backupCode[i] ? "rgba(79,110,247,0.4)" : "var(--color-border)",
                  background: backupCode[i] ? "var(--color-panel)" : "#fafafa",
                }}
              />
            ))}
          </div>
          <div style={{ ...(styles.backupHint as any), marginBottom: 12 }}>
            恢复码为数字+字母组合，例如：A3B7-C9E2
          </div>
          <div style={{
            ...(styles.errorMsg as any),
            ...(backupError ? styles.errorMsgShow : {}),
          } as any}>
            ❌ 恢复码无效或已使用
          </div>
          <button
            style={{
              ...styles.submitBtn,
              ...(backupCode.length < 10 || backupLoading ? styles.submitBtnDisabled : {}),
            }}
            onClick={() => verifyBackup(backupCode)}
            disabled={backupCode.length < 10 || backupLoading}
          >
            {backupLoading ? "验证中…" : "验证恢复码"}
          </button>
          <div style={styles.resendLink as any}>
            <a style={styles.link as any} onClick={() => switchMethod("totp")}>← 返回 TOTP 验证</a>
          </div>
        </>
      )}

      <div style={styles.footerLinks as any}>
        <a style={styles.link as any} onClick={() => router.push("/login")}>← 返回登录</a>
      </div>
    </div>
  );
}

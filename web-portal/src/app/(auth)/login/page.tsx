/**
 * LoginPage — 对齐 portal-login.html + portal-register.html + portal-oauth.html
 *
 * Features:
 * - Center card layout (420px width)
 * - Login/Register tab switching
 * - Email/password with forgot-password link
 * - OAuth third-party login buttons (GitHub/WeChat/Telegram/Google)
 * - Login failure counter + lockout hint
 * - Password strength meter (register)
 * - Email verification code after login attempts
 * - 2FA TOTP flow (if 2FA enabled → redirect to /2fa)
 */
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { HelpIcon } from "@3cloud/shared-ui";
import { useRouter } from "next/navigation";

/* ==================== Types ==================== */
type AuthTab = "login" | "register";
type LoginStep = "credentials" | "captcha" | "2fa";
type RegisterStep = "form" | "success";

/* ==================== Styles ==================== */
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
  tabs: {
    display: "flex",
    borderBottom: "1px solid var(--color-divider)",
    marginBottom: 24,
  } as const,
  tab: (active: boolean) => ({
    flex: 1,
    padding: 10,
    textAlign: "center",
    fontSize: "var(--font-size-base)",
    fontWeight: active ? 600 : 400,
    color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
    cursor: "pointer",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid var(--color-primary)" : "2px solid transparent",
    transition: "all var(--transition-fast)",
  } as const),
  formGroup: {
    marginBottom: 16,
  } as const,
  label: {
    display: "block",
    fontSize: "var(--font-size-md)",
    color: "var(--color-text)",
    marginBottom: 6,
  } as const,
  required: {
    color: "var(--color-danger-text)",
    marginLeft: 2,
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
  forgotLink: {
    float: "right",
    fontSize: "var(--font-size-md)",
    color: "var(--color-primary)",
    textDecoration: "none",
    marginTop: -8,
    cursor: "pointer",
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
  } as const,
  divider: {
    display: "flex",
    alignItems: "center",
    margin: "24px 0 16px",
    color: "#bbb",
    fontSize: "var(--font-size-md)",
  } as const,
  dividerLine: {
    flex: 1,
    height: 1,
    background: "var(--color-divider)",
  } as const,
  socialBtns: {
    display: "flex",
    gap: 8,
  } as const,
  socialBtn: {
    flex: 1,
    height: 40,
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-lg)",
    background: "var(--color-panel)",
    fontSize: "var(--font-size-md)",
    cursor: "pointer",
    transition: "border var(--transition-fast)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
  alertInfo: {
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
  captchaArea: {
    marginBottom: 16,
  } as const,
  passwordStrength: {
    display: "flex",
    gap: 4,
    marginTop: 6,
  } as const,
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  } as const,
  strengthText: {
    fontSize: "var(--font-size-sm)",
    color: "var(--color-text-secondary)",
    marginTop: 4,
  } as const,
  successMsg: {
    textAlign: "center",
    padding: "20px 0",
  } as const,
};

/* ==================== OAuth Providers ==================== */
interface OAuthProvider {
  name: string;
  display: string;
  icon: string;
}

const OAUTH_PROVIDERS: OAuthProvider[] = [
  { name: "github", display: "GitHub", icon: "🐙" },
  { name: "wechat", display: "微信", icon: "💬" },
  { name: "telegram", display: "Telegram", icon: "📨" },
  { name: "google", display: "Google", icon: "🔵" },
];

const LOGIN_HELP = "登录您的账号以管理 API Key 和查看消费记录";
const REGISTER_HELP = "注册账号后即可使用 API Token 服务";
const MAX_LOGIN_FAILURES = 5;

/* ==================== Component ==================== */
export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<AuthTab>("login");

  // Login state
  const [email, setEmail] = useState("demo@test.com");
  const [password, setPassword] = useState("Demo1234!");
  const [loginStep, setLoginStep] = useState<LoginStep>("credentials");
  const [loginError, setLoginError] = useState("");
  const [loginFailCount, setLoginFailCount] = useState(0);
  const [captcha, setCaptcha] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Register state
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regStep, setRegStep] = useState<RegisterStep>("form");
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");

  // OAuth loading
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  // Password strength
  const passwordStrength = getPasswordStrength(regPassword);

  // TOTP input focus
  const totpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const switchTab = useCallback((newTab: AuthTab) => {
    setTab(newTab);
    setLoginError("");
    setRegError("");
    setLoginStep("credentials");
    setLoginFailCount(0);
  }, []);

  const handleLogin = useCallback(async () => {
    if (loginLoading) return;
    if (!email.trim()) {
      setLoginError("请输入邮箱地址");
      return;
    }
    if (!password.trim()) {
      setLoginError("请输入密码");
      return;
    }

    setLoginLoading(true);
    setLoginError("");

    // Simulate login API call
    await new Promise((r) => setTimeout(r, 800));

    const newCount = loginFailCount + 1;

    if (password === "Demo1234!") {
      // Success: show captcha after 3+ failures
      if (newCount >= 3 && loginStep === "credentials") {
        setLoginStep("captcha");
        setLoginFailCount(newCount);
        setLoginLoading(false);
        return;
      }
      // Simulate 2FA enabled
      router.push("/2fa");
    } else {
      setLoginFailCount(newCount);
      if (newCount >= MAX_LOGIN_FAILURES) {
        setLoginError(
          `账号已锁定：连续 ${MAX_LOGIN_FAILURES} 次登录失败。请 ${Math.ceil(
            newCount / MAX_LOGIN_FAILURES
          ) * 15
          } 分钟后重试，或点击「忘记密码」重置密码。`
        );
      } else {
        setLoginError(
          `邮箱或密码错误，还剩 ${MAX_LOGIN_FAILURES - newCount} 次尝试机会`
        );
      }
    }

    setLoginLoading(false);
  }, [email, password, loginFailCount, loginStep, loginLoading]);

  const handleRegister = useCallback(async () => {
    if (regLoading) return;
    if (!regEmail.trim()) {
      setRegError("请输入邮箱地址");
      return;
    }
    if (regPassword.length < 8) {
      setRegError("密码长度至少为 8 位");
      return;
    }
    if (!/[a-zA-Z]/.test(regPassword) || !/\d/.test(regPassword) || !/[^a-zA-Z\d]/.test(regPassword)) {
      setRegError("密码需包含字母、数字和特殊字符");
      return;
    }
    if (regPassword !== regConfirm) {
      setRegError("两次输入的密码不一致");
      return;
    }

    setRegLoading(true);
    setRegError("");
    await new Promise((r) => setTimeout(r, 1000));
    setRegStep("success");
    setRegLoading(false);
  }, [regEmail, regPassword, regConfirm, regLoading]);

  const handleOAuth = useCallback(
    async (provider: string) => {
      setOauthLoading(provider);
      await new Promise((r) => setTimeout(r, 1200));
      setOauthLoading(null);
      router.push("/2fa");
    },
    [router]
  );

  const handleForgotPassword = useCallback(() => {
    router.push("/forgot-password");
  }, [router]);

  const locked = loginFailCount >= MAX_LOGIN_FAILURES && loginStep === "captcha";

  // TOTP input handler
  const handleTotpInput = (idx: number, val: string) => {
    const newCode = totpCode.substring(0, idx) + val + totpCode.substring(idx + 1);
    setTotpCode(newCode.replace(/\D/g, ""));
    // Auto-focus next
    const target = val ? idx + 1 : idx - 1;
    if (target >= 0 && target < 6 && totpRefs.current[target]) {
      totpRefs.current[target]?.focus();
    }
  };

  // Render login tab
  const renderLogin = () => {
    if (loginStep === "2fa") {
      return (
        <>
          <div style={styles.alertInfo as any}>
            <span>🔒</span>
            <span>两步验证已启用。请输入验证器中的 6 位验证码。</span>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
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
                  if (e.key === "Backspace" && !totpCode[i] && i > 0)
                    totpRefs.current[i - 1]?.focus();
                  if (e.key === "Enter" && totpCode.length === 6)
                    router.push("/2fa");
                }}
                style={{
                  width: 52,
                  height: 60,
                  textAlign: "center",
                  fontSize: 24,
                  fontWeight: 600,
                  borderRadius: "var(--radius-lg)",
                  border: totpCode[i] ? "2px solid rgba(79,110,247,0.4)" : "2px solid var(--color-border)",
                  background: totpCode[i] ? "var(--color-panel)" : "#fafafa",
                  color: "var(--color-text)",
                  outline: "none",
                  transition: "all var(--transition-fast)",
                }}
              />
            ))}
          </div>
          <button
            style={{
              ...styles.submitBtn,
              ...(totpCode.length < 6 ? styles.submitBtnDisabled : {}),
            }}
            disabled={totpCode.length < 6}
            onClick={() => router.push("/2fa")}
          >
            验证
          </button>
          <div style={{ ...(styles.footerLinks as any), marginTop: 12 }}>
            <button
              onClick={() => setLoginStep("credentials")}
              style={{ ...(styles.link as any), background: "none", border: "none" }}
            >
              ← 返回登录
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        {loginError && (
          <div style={styles.errorMsg as any}>
            ❌ {loginError}
          </div>
        )}
        <div style={styles.formGroup as any}>
          <label style={styles.label as any}>
            邮箱 <span style={styles.required as any}>*</span>
          </label>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setLoginError(""); }}
            style={styles.input as any}
            disabled={locked}
          />
        </div>
        <div style={styles.formGroup as any}>
          <label style={styles.label as any}>
            密码 <span style={styles.required as any}>*</span>
          </label>
          <input
            type="password"
            placeholder="请输入密码"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setLoginError(""); }}
            style={styles.input as any}
            disabled={locked}
          />
          <a style={styles.forgotLink as any} onClick={handleForgotPassword}>
            忘记密码？
          </a>
        </div>

        {loginStep === "captcha" && (
          <div style={styles.captchaArea as any}>
            <label style={styles.label as any}>
              验证码 <span style={styles.required as any}>*</span>
            </label>
            <input
              type="text"
              maxLength={6}
              placeholder="输入验证码"
              value={captcha}
              onChange={(e) => setCaptcha(e.target.value.replace(/\D/g, ""))}
              style={styles.input as any}
            />
          </div>
        )}

        <button
          style={{
            ...styles.submitBtn,
            ...(loginLoading || locked ? styles.submitBtnDisabled : {}),
          }}
          onClick={handleLogin}
          disabled={loginLoading || locked}
        >
          {loginLoading ? "登录中…" : locked ? `锁定中(${loginFailCount}次失败)` : "登录"}
        </button>

        <div style={styles.footerLinks as any}>
          还没有账号？
          <button
            onClick={() => switchTab("register")}
            style={{ ...(styles.link as any), background: "none", border: "none" }}
          >
            立即注册
          </button>
        </div>

        <div style={styles.divider as any}>
          <span style={styles.dividerLine as any} />
          <span style={{ margin: "0 16px" }}>或使用</span>
          <span style={styles.dividerLine as any} />
        </div>
        <div style={styles.socialBtns as any}>
          {OAUTH_PROVIDERS.map((p) => (
            <button
              key={p.name}
              style={{
                ...(styles.socialBtn as any),
                ...(oauthLoading === p.name
                  ? { opacity: 0.6, pointerEvents: "none" } as any
                  : {}),
              }}
              onClick={() => handleOAuth(p.name)}
              disabled={oauthLoading !== null}
            >
              {oauthLoading === p.name ? "…" : p.icon}
            </button>
          ))}
        </div>
      </>
    );
  };

  // Render register tab
  const renderRegister = () => {
    if (regStep === "success") {
      return (
        <div style={styles.successMsg as any}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
          <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>
            注册成功！
          </div>
          <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
            已发送激活链接至<br />
            <strong style={{ color: "var(--color-text)" }}>{regEmail}</strong>
            <br /><br />
            请前往邮箱点击链接完成激活<br />
            链接有效时间由后台配置
          </div>
          <button
            style={{ ...(styles.submitBtn as any), width: "auto", padding: "0 32px", marginTop: 16 }}
            onClick={() => setTab("login")}
          >
            前往登录
          </button>
        </div>
      );
    }

    return (
      <>
        {regError && (
          <div style={styles.errorMsg as any}>
            ❌ {regError}
          </div>
        )}
        <div style={styles.formGroup as any}>
          <label style={styles.label as any}>
            邮箱 <span style={styles.required as any}>*</span>
          </label>
          <input
            type="email"
            placeholder="your@email.com"
            value={regEmail}
            onChange={(e) => { setRegEmail(e.target.value); setRegError(""); }}
            style={styles.input as any}
          />
        </div>
        <div style={styles.formGroup as any}>
          <label style={styles.label as any}>
            密码 <span style={styles.required as any}>*</span>
          </label>
          <input
            type="password"
            placeholder="≥8位，字母+数字+特殊字符"
            value={regPassword}
            onChange={(e) => { setRegPassword(e.target.value); setRegError(""); }}
            style={styles.input as any}
          />
          <div style={styles.passwordStrength as any}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  ...(styles.strengthBar as any),
                  background: i <= passwordStrength.level
                    ? (passwordStrength.level <= 1 ? "var(--color-danger-text)" :
                       passwordStrength.level <= 2 ? "#f59e0b" : "var(--color-success-text)")
                    : "#eee",
                }}
              />
            ))}
          </div>
          <div style={styles.strengthText as any}>
            强度：{["弱", "较弱", "中等", "强"][passwordStrength.level] || "弱"}
          </div>
        </div>
        <div style={styles.formGroup as any}>
          <label style={styles.label as any}>
            确认密码 <span style={styles.required as any}>*</span>
          </label>
          <input
            type="password"
            placeholder="再次输入密码"
            value={regConfirm}
            onChange={(e) => { setRegConfirm(e.target.value); setRegError(""); }}
            style={styles.input as any}
          />
        </div>
        <button
          style={{
            ...styles.submitBtn,
            ...(regLoading ? styles.submitBtnDisabled : {}),
          }}
          onClick={handleRegister}
          disabled={regLoading}
        >
          {regLoading ? "注册中…" : "注册"}
        </button>
        <div style={styles.footerLinks as any}>
          已有账号？
          <button
            onClick={() => switchTab("login")}
            style={{ ...(styles.link as any), background: "none", border: "none" }}
          >
            立即登录
          </button>
        </div>
      </>
    );
  };

  return (
    <div style={styles.container as any}>
      <div style={styles.logo as any}>
        <h1 style={styles.logoTitle as any}>🚀 3cloud</h1>
        <p style={styles.logoSub as any}>AI Token 聚合分发平台</p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <h2 style={{ fontSize: "var(--font-size-xl)", fontWeight: 600, color: "#1a1a1a" }}>
          {tab === "login" ? "登录" : "注册账号"}
        </h2>
        <HelpIcon text={tab === "login" ? LOGIN_HELP : REGISTER_HELP} />
      </div>

      <div style={styles.tabs as any}>
        <button style={styles.tab(tab === "login")} onClick={() => switchTab("login")}>
          登录
        </button>
        <button style={styles.tab(tab === "register")} onClick={() => switchTab("register")}>
          注册
        </button>
      </div>

      {tab === "login" ? renderLogin() : renderRegister()}
    </div>
  );
}

/* ==================== Helpers ==================== */
function getPasswordStrength(pwd: string): { level: number; label: string } {
  if (!pwd) return { level: 0, label: "弱" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^a-zA-Z\d]/.test(pwd)) score++;
  const level = Math.min(4, score);
  return { level, label: ["弱", "较弱", "中等", "强"][level] || "弱" };
}

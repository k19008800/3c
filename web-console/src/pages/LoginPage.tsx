import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, extractError } from "../lib/api";
import { useAuthStore, type User } from "../store/auth";
import { HelpIcon, useToast } from "@3cloud/shared-ui";
import OtpInput from "../components/OtpInput";
import { useI18n } from "../lib/i18n-context";
import "./auth.css";

/**
 * 登录页 — 支持 2FA 两步验证 + GitHub 第三方快捷登录
 *
 * 流程：
 * 1. POST /auth/login
 *    - 未启用 2FA → 直接返回 { user, accessToken, ... } → 写会话跳转
 *    - 已启用 2FA → 返回 { twoFactorRequired: true, tempToken }（5 分钟有效）→ 进入第二步
 * 2. POST /auth/2fa/verify（{ tempToken, token | backupCode }）→ 发正式 JWT → 写会话跳转
 *
 * 社交登录：GitHub 走真实 OAuth（GET /auth/oauth/github/url → 跳转授权页）；
 * 微信 / Telegram / Google 后端未实现，标注"即将上线"。
 */

/** 登录第一步响应：2FA 用户 vs 普通用户 */
interface LoginStepOneResponse {
  twoFactorRequired?: boolean;
  tempToken?: string;
  user?: User;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

/** 2FA 第二步响应：正式 JWT + 用户摘要 */
interface Verify2faResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

/** 品牌母题：信号蓝节点网络图（精密云基础设施） */
function BrandMark() {
  return (
    <svg className="auth-brand__mark" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="42" height="42" rx="11" fill="#1896FF" />
      <path d="M15 27 L27 16" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      <circle cx="14" cy="28" r="4" fill="#fff" />
      <circle cx="30" cy="14" r="4" fill="#fff" />
      <circle cx="30" cy="30" r="2.6" fill="#fff" opacity="0.75" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1L15 14H1L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.5V9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r="0.9" fill="currentColor" />
    </svg>
  );
}

/* 第三方登录 SVG 图标 */
const icons: Record<string, React.ReactNode> = {
  GitHub: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.75 2.7 1.25 3.36.95.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.14c0 .3.2.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  ),
  微信: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.5 4C5.36 4 2 6.9 2 10.47c0 2.04 1.1 3.86 2.83 5.03l-.7 2.1 2.45-1.23c.65.18 1.34.28 2.05.3a5.4 5.4 0 0 1-.2-1.46c0-3.13 2.98-5.66 6.66-5.66.24 0 .47.01.7.03C15.1 6.2 12.56 4 9.5 4ZM7.2 8.6a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Zm4.6 0a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8ZM15.6 10.6c-3.2 0-5.8 2.18-5.8 4.87 0 2.68 2.6 4.86 5.8 4.86.63 0 1.24-.09 1.8-.26l2.13 1.07-.6-1.82c1.43-.98 2.37-2.5 2.37-4.19 0-2.69-2.6-4.86-5.7-4.86Zm-1.9 2.7a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm3.7 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Z" />
    </svg>
  ),
  Telegram: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.9 4.3 19.1 19.1c-.2 1-.8 1.2-1.6.8l-4.5-3.3-2.1 2.1c-.2.2-.4.4-.9.4l.3-4.6 8.4-7.6c.4-.3-.1-.5-.6-.2L6.2 13.2 1.7 11.8c-1-.3-1-1 .2-1.4l17.6-6.8c.8-.3 1.5.2 1.4.7Z" />
    </svg>
  ),
  Google: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.6 12.23c0-.68-.06-1.36-.19-2H12v3.83h5.39a4.55 4.55 0 0 1-1.97 2.98v2.46h3.19c1.86-1.72 2.99-4.26 2.99-7.27Z" />
      <path d="M12 22c2.67 0 4.92-.89 6.56-2.43l-3.19-2.46c-.89.6-2.03.95-3.37.95-2.59 0-4.79-1.75-5.57-4.1H3.12v2.53A10 10 0 0 0 12 22Z" opacity=".85" />
      <path d="M6.43 13.96a6 6 0 0 1 0-3.92V7.5H3.12a10 10 0 0 0 0 9l3.31-2.54Z" opacity=".7" />
      <path d="M12 6.38c1.45 0 2.74.5 3.76 1.48l2.82-2.82A9.98 9.98 0 0 0 3.12 7.5l3.31 2.53C7.21 8.13 9.41 6.38 12 6.38Z" opacity=".9" />
    </svg>
  ),
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 2FA 第二步状态
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState<string[]>(Array(6).fill(""));
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const { toast } = useToast();
  const { t } = useI18n();

  /** 第一步：账号密码登录（2FA 用户返回临时令牌，进入第二步） */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<LoginStepOneResponse>("/auth/login", { email, password });
      const data = res.data;
      if (data.twoFactorRequired && data.tempToken) {
        // 已启用 2FA：切换第二步界面，等待验证码 / 备用码
        setTempToken(data.tempToken);
        setTwoFactorStep(true);
        setTwoFactorCode(Array(6).fill(""));
        setBackupCode("");
        setUseBackupCode(false);
        toast.info(t("auth.2faEnabledToast"));
      } else if (data.accessToken) {
        setSession(data.accessToken, data.user ?? null);
        navigate("/");
      } else {
        throw new Error(t("auth.invalidResponse"));
      }
    } catch (err: any) {
      const msg = extractError(err);
      setError(msg);
      // Show captcha after first failure
      setShowCaptcha(true);
    } finally {
      setLoading(false);
    }
  };

  /** 第二步：TOTP 或备用码 → verify → 正式 JWT */
  const handleVerify2fa = async () => {
    if (!tempToken) return;
    setError(null);
    setVerifying(true);
    try {
      const body = useBackupCode
        ? { tempToken, backupCode }
        : { tempToken, token: twoFactorCode.join("") };
      const res = await api.post<Verify2faResponse>("/auth/2fa/verify", body);
      setSession(res.data.accessToken, res.data.user);
      toast.success("登录成功");
      navigate("/");
    } catch (err: any) {
      setError(extractError(err));
      setTwoFactorCode(Array(6).fill(""));
      setBackupCode("");
    } finally {
      setVerifying(false);
    }
  };

  /** 返回第一步重新输入密码 */
  const handleBackToLogin = () => {
    setTwoFactorStep(false);
    setTempToken(null);
    setTwoFactorCode(Array(6).fill(""));
    setBackupCode("");
    setError(null);
  };

  /** 社交登录：GitHub 真实流程，其余平台即将上线 */
  const handleSocialLogin = async (provider: string) => {
    if (provider !== "GitHub") {
      toast.info(`${provider} 登录即将上线`);
      return;
    }
    try {
      const res = await api.get<{ url: string }>("/auth/oauth/github/url");
      window.location.href = res.data.url;
    } catch (err: any) {
      toast.error(extractError(err));
    }
  };

  const socialProviders = [
    { label: "GitHub", available: true },
    { label: "微信", available: false },
    { label: "Telegram", available: false },
    { label: "Google", available: false },
  ];

  const canVerify2fa = useBackupCode ? backupCode.length > 0 : twoFactorCode.join("").length === 6;

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Brand */}
        <div className="auth-brand">
          <BrandMark />
          <div className="auth-brand__name">浩寅云</div>
          <div className="auth-brand__tag">AI Token 聚合分发平台</div>
        </div>

        {/* Page Title */}
        <div className="auth-title">
          {twoFactorStep ? t("auth.pageTitle2fa") : t("auth.pageTitle")}
          <HelpIcon
            text={twoFactorStep
              ? t("auth.2faHint")
              : t("auth.loginHelp")}
            level="page"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="auth-alert" role="alert">
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}

        {twoFactorStep ? (
          /* ════════ 2FA 第二步 ════════ */
          <div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
              账号 <strong>{email}</strong> 已开启两步验证，请选择一种方式完成验证：
            </div>

            {/* 验证方式切换 tab */}
            <div className="auth-step-tabs">
              <button
                type="button"
                onClick={() => setUseBackupCode(false)}
                className={useBackupCode ? "auth-step-tab" : "auth-step-tab auth-step-tab--active"}
              >
                验证器验证码
              </button>
              <button
                type="button"
                onClick={() => setUseBackupCode(true)}
                className={useBackupCode ? "auth-step-tab auth-step-tab--active" : "auth-step-tab"}
              >
                备用恢复码
              </button>
            </div>

            {useBackupCode ? (
              <>
                <input
                  type="text"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX"
                  maxLength={14}
                  className="auth-input"
                  style={{ marginBottom: 8 }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>
                  输入启用 2FA 时保存的备用恢复码（大写，可省略分隔符）
                  <HelpIcon text="备用恢复码在启用两步验证时生成，每个备用码仅可使用一次" />
                </div>
              </>
            ) : (
              <>
                <OtpInput value={twoFactorCode} onChange={setTwoFactorCode} />
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16, marginTop: 8 }}>
                  输入验证器（Google Authenticator / Authy 等）当前显示的 6 位动态验证码
                  <HelpIcon text="验证码每 30 秒刷新一次，请使用当前显示的验证码" />
                </div>
              </>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleVerify2fa}
                disabled={!canVerify2fa || verifying}
                className="auth-btn"
                style={{ width: "auto", padding: "0 24px", marginTop: 0 }}
              >
                {verifying ? t("auth.verifying") : t("auth.verifyAndLogin")}
              </button>
              <HelpIcon text="提交验证码后完成登录；验证码错误 5 次或临时令牌过期需重新输入密码" />
            </div>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                type="button"
                onClick={handleBackToLogin}
                className="auth-link"
                style={{ background: "none", border: "none", fontSize: 13, cursor: "pointer" }}
              >
                {t("auth.backToLogin")}
              </button>
              <HelpIcon text="返回账号密码登录步骤，临时令牌将失效" />
            </div>
          </div>
        ) : (
          /* ════════ 第一步：账号密码 ════════ */
          <>
            <form onSubmit={handleSubmit}>
              {/* Email */}
              <div className="auth-field">
                <label>
                  {t("auth.email")} <span style={{ color: "var(--color-danger-text)" }}>*</span>
                  <HelpIcon text="请输入您注册时使用的邮箱地址" level="button" />
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="auth-input"
                />
              </div>

              {/* Password */}
              <div className="auth-field">
                <label>
                  {t("auth.password")} <span style={{ color: "var(--color-danger-text)" }}>*</span>
                  <HelpIcon text="请输入您的登录密码" level="button" />
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  required
                  className="auth-input"
                />
                <Link
                  to="/forgot-password"
                  className="auth-link"
                  style={{ float: "right", fontSize: 13, marginTop: 6 }}
                >
                  {t("auth.forgotPassword")}
                </Link>
              </div>

              {/* Captcha (shown after failed login) */}
              {showCaptcha && (
                <div className="auth-field">
                  <label>
                    {t("auth.captcha")}
                    <HelpIcon text="验证码用于防止暴力破解，输入图片中的字符" level="button" />
                  </label>
                  <input
                    type="text"
                    value={captcha}
                    onChange={(e) => setCaptcha(e.target.value)}
                    placeholder="输入验证码"
                    maxLength={6}
                    className="auth-input"
                  />
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="auth-btn"
              >
                {loading ? t("auth.loggingIn") : t("auth.loginButton")}
              </button>
            </form>

            {/* Register link */}
            <div className="auth-foot">
              {t("auth.noAccount")} <Link to="/register">{t("auth.registerNow")}</Link>
            </div>

            {/* Social Login Divider */}
            <div className="auth-divider">{t("auth.orUse")}</div>

            {/* Social Buttons */}
            <div className="auth-social">
              {socialProviders.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handleSocialLogin(p.label)}
                  disabled={!p.available}
                  className="auth-social__btn"
                  title={p.available ? "使用 GitHub 账号快捷登录" : `${p.label} 登录即将上线`}
                >
                  {icons[p.label]}
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

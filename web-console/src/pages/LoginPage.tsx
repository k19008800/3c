import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, extractError } from "../lib/api";
import { useAuthStore, type User } from "../store/auth";
import { HelpIcon, useToast } from "@3cloud/shared-ui";
import OtpInput from "../components/OtpInput";

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
  expiresIn: number;
}

const inputStyle: React.CSSProperties = {
  width: "100%", height: 40, border: "1px solid var(--color-border)",
  borderRadius: 8, padding: "0 12px", fontSize: 14,
  outline: "none", transition: "border .2s", boxSizing: "border-box",
  fontFamily: "inherit",
};

const submitBtnStyle: React.CSSProperties = {
  width: "100%", height: 44, background: "var(--color-primary)",
  color: "#fff", border: "none", borderRadius: 8, fontSize: 16,
  cursor: "pointer", marginTop: 8, fontFamily: "inherit",
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
        toast.info("该账号已开启两步验证，请输入验证码完成登录");
      } else if (data.accessToken) {
        setSession(data.accessToken, data.user ?? null);
        navigate("/");
      } else {
        throw new Error("登录响应异常，请稍后重试");
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
    { label: "GitHub", icon: "🐙", available: true },
    { label: "微信", icon: "💬", available: false },
    { label: "Telegram", icon: "✈️", available: false },
    { label: "Google", icon: "🔵", available: false },
  ];

  const canVerify2fa = useBackupCode ? backupCode.length > 0 : twoFactorCode.join("").length === 6;

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--color-bg)",
      fontFamily: 'var(--font-family, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif)',
    }}>
      <div style={{
        width: 420,
        background: "var(--color-panel)",
        borderRadius: 16,
        padding: "40px 32px",
        boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, color: "var(--color-text)", margin: 0 }}>🚀 3cloud</h1>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginTop: 4, marginBottom: 0 }}>
            AI Token 聚合分发平台
          </p>
        </div>

        {/* Page Title */}
        <div style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--color-text)",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          {twoFactorStep ? "两步验证" : "登录"}
          <HelpIcon
            text={twoFactorStep
              ? "该账号已开启两步验证，请输入验证器验证码或备用恢复码完成登录（临时令牌 5 分钟有效）"
              : "登录您的账号以管理 API Key 和查看消费记录"}
            level="page"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            background: "#fff1f0",
            border: "1px solid #ffccc7",
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 13,
            color: "#cf1322",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            ❌ {error}
          </div>
        )}

        {twoFactorStep ? (
          /* ════════ 2FA 第二步 ════════ */
          <div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>
              账号 <strong>{email}</strong> 已开启两步验证，请选择一种方式完成验证：
            </div>

            {/* 验证方式切换 tab */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => setUseBackupCode(false)}
                style={{
                  flex: 1, height: 36, borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  border: useBackupCode ? "1px solid var(--color-border)" : "1px solid rgba(79,110,247,0.4)",
                  background: useBackupCode ? "var(--color-panel)" : "rgba(79,110,247,0.08)",
                  color: useBackupCode ? "var(--color-text-secondary)" : "var(--color-primary)",
                }}
              >
                验证器验证码
              </button>
              <button
                onClick={() => setUseBackupCode(true)}
                style={{
                  flex: 1, height: 36, borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                  border: useBackupCode ? "1px solid rgba(79,110,247,0.4)" : "1px solid var(--color-border)",
                  background: useBackupCode ? "rgba(79,110,247,0.08)" : "var(--color-panel)",
                  color: useBackupCode ? "var(--color-primary)" : "var(--color-text-secondary)",
                }}
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
                  style={{ ...inputStyle, marginBottom: 8 }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>
                  输入启用 2FA 时保存的备用恢复码（大写，可省略分隔符）
                  <HelpIcon text="备用恢复码在启用两步验证时生成，每个备用码仅可使用一次" />
                </div>
              </>
            ) : (
              <>
                <OtpInput value={twoFactorCode} onChange={setTwoFactorCode} />
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>
                  输入验证器（Google Authenticator / Authy 等）当前显示的 6 位动态验证码
                  <HelpIcon text="验证码每 30 秒刷新一次，请使用当前显示的验证码" />
                </div>
              </>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={handleVerify2fa}
                disabled={!canVerify2fa || verifying}
                style={{
                  ...submitBtnStyle,
                  width: "auto", padding: "0 24px", marginTop: 0,
                  background: canVerify2fa && !verifying ? "var(--color-primary)" : "#a0b4f9",
                  cursor: canVerify2fa && !verifying ? "pointer" : "not-allowed",
                }}
              >
                {verifying ? "验证中..." : "验证并登录"}
              </button>
              <HelpIcon text="提交验证码后完成登录；验证码错误 5 次或临时令牌过期需重新输入密码" />
            </div>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                onClick={handleBackToLogin}
                style={{ background: "none", border: "none", color: "var(--color-primary)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                返回重新输入密码
              </button>
              <HelpIcon text="返回账号密码登录步骤，临时令牌将失效" />
            </div>
          </div>
        ) : (
          /* ════════ 第一步：账号密码 ════════ */
          <>
            <form onSubmit={handleSubmit}>
              {/* Email */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
                  邮箱 <span style={{ color: "var(--color-danger-text)" }}>*</span>
                  <HelpIcon text="请输入您注册时使用的邮箱地址" level="button" />
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  style={inputStyle}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
                  密码 <span style={{ color: "var(--color-danger-text)" }}>*</span>
                  <HelpIcon text="请输入您的登录密码" level="button" />
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  required
                  style={inputStyle}
                />
                <Link
                  to="/forgot-password"
                  style={{
                    float: "right",
                    fontSize: 13,
                    color: "var(--color-primary)",
                    textDecoration: "none",
                    marginTop: 4,
                  }}
                >
                  忘记密码？
                </Link>
              </div>

              {/* Captcha (shown after failed login) */}
              {showCaptcha && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
                    验证码
                    <HelpIcon text="验证码用于防止暴力破解，输入图片中的字符" level="button" />
                  </label>
                  <input
                    type="text"
                    value={captcha}
                    onChange={(e) => setCaptcha(e.target.value)}
                    placeholder="输入验证码"
                    maxLength={6}
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  ...submitBtnStyle,
                  background: loading ? "#a0b4f9" : "var(--color-primary)",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "登录中..." : "登录"}
              </button>
            </form>

            {/* Register link */}
            <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--color-text-secondary)" }}>
              还没有账号？<Link to="/register" style={{ color: "var(--color-primary)", textDecoration: "none" }}>立即注册</Link>
            </div>

            {/* Social Login Divider */}
            <div style={{
              display: "flex", alignItems: "center", margin: "24px 0 16px",
              color: "#bbb", fontSize: 13,
            }}>
              <span style={{ flex: 1, height: 1, background: "var(--color-divider)", marginRight: 16 }} />
              或使用
              <span style={{ flex: 1, height: 1, background: "var(--color-divider)", marginLeft: 16 }} />
            </div>

            {/* Social Buttons */}
            <div style={{ display: "flex", gap: 12 }}>
              {socialProviders.map((p) => (
                <div key={p.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <button
                    onClick={() => handleSocialLogin(p.label)}
                    disabled={!p.available}
                    style={{
                      width: "100%", height: 40, border: "1px solid var(--color-border)",
                      borderRadius: 8, background: "#fff", fontSize: 13,
                      cursor: p.available ? "pointer" : "not-allowed",
                      fontFamily: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                      opacity: p.available ? 1 : 0.5,
                    }}
                  >
                    {p.icon} {p.label}
                  </button>
                  <HelpIcon
                    text={p.available
                      ? "使用 GitHub 账号快捷登录，授权后自动绑定或注册账号"
                      : `${p.label} 登录即将上线`}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

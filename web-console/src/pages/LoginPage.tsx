import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { extractError } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      const msg = extractError(err);
      setError(msg);
      // Show captcha after first failure
      setShowCaptcha(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = (provider: string) => {
    // 后端缺失：第三方OAuth登录回调
    // window.location.href = `/api/v1/auth/oauth/${provider}`;
    toast.info(`${provider} 登录功能开发中`);
  };

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
          登录
          <HelpIcon text="登录您的账号以管理 API Key 和查看消费记录" level="page" />
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
              style={{
                width: "100%", height: 40, border: "1px solid var(--color-border)",
                borderRadius: 8, padding: "0 12px", fontSize: 14,
                outline: "none", transition: "border .2s", boxSizing: "border-box",
                fontFamily: "inherit",
              }}
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
              style={{
                width: "100%", height: 40, border: "1px solid var(--color-border)",
                borderRadius: 8, padding: "0 12px", fontSize: 14,
                outline: "none", transition: "border .2s", boxSizing: "border-box",
                fontFamily: "inherit",
              }}
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
                style={{
                  width: "100%", height: 40, border: "1px solid var(--color-border)",
                  borderRadius: 8, padding: "0 12px", fontSize: 14,
                  outline: "none", transition: "border .2s", boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", height: 44, background: loading ? "#a0b4f9" : "var(--color-primary)",
              color: "#fff", border: "none", borderRadius: 8, fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer", marginTop: 8,
              fontFamily: "inherit",
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
          {[
            { label: "GitHub", icon: "🐙" },
            { label: "微信", icon: "💬" },
            { label: "Telegram", icon: "✈️" },
            { label: "Google", icon: "🔵" },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => handleSocialLogin(p.label)}
              style={{
                flex: 1, height: 40, border: "1px solid var(--color-border)",
                borderRadius: 8, background: "#fff", fontSize: 13,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              }}
              title={`使用 ${p.label} 登录`}
            >
              {p.icon} {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

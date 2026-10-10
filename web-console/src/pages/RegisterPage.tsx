import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";
import { useI18n } from "../lib/i18n-context";
import "./auth.css";

/* 密码强度评估 */
function getStrength(pw: string): { score: number; label: string; cls: string } {
  if (!pw) return { score: 0, label: "未输入", cls: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw) || pw.length >= 12) score++;
  const levels: Array<{ label: string; cls: string }> = [
    { label: "弱 — 建议增加复杂度", cls: "weak" },
    { label: "一般 — 可接受", cls: "medium" },
    { label: "较强 — 推荐", cls: "medium" },
    { label: "强 — 非常安全", cls: "strong" },
  ];
  const idx = Math.max(0, Math.min(score - 1, 3));
  const level = levels[idx]!;
  return { score: Math.min(score, 4), label: level.label, cls: level.cls };
}

const strengthColors: Record<string, string> = {
  weak: "var(--color-danger-text)",
  medium: "var(--color-warning-text)",
  strong: "var(--color-success-text)",
};

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

function MailIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  // P2-2 邀请链接落地：/?invite_code=XXX 自动预填邀请码（代理商分享链接打开注册页）
  const [searchParams] = useSearchParams();
  const [inviteCode, setInviteCode] = useState(searchParams.get("invite_code") ?? "");
  const [successEmail, setSuccessEmail] = useState("");
  const { toast } = useToast();
  const { t } = useI18n();

  const strength = getStrength(password);
  const pwMatch = confirmPwd ? password === confirmPwd : null;

  const registerMut = useMutation({
    mutationFn: async () =>
      // 后端可能有 /auth/register 接口
      (await api.post("/auth/register", {
        email,
        password,
        invite_code: inviteCode || undefined,
      })).data,
    onSuccess: () => {
      setSuccessEmail(email);
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t("auth.emailRequired"));
      return;
    }
    if (password !== confirmPwd) {
      toast.error(t("auth.passwordMismatch"));
      return;
    }
    registerMut.mutate();
  };

  // 注册成功 → 显示激活邮件提示
  if (successEmail) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <div className="auth-success-icon"><MailIcon /></div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text)", marginBottom: 8 }}>
            {t("auth.registerSuccessTitle")}
          </div>
          <div style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            {t("auth.activationSent")}<br />
            <strong style={{ color: "var(--color-text)" }}>{successEmail}</strong><br /><br />
            {t("auth.openEmailToActivate")}<br />
          </div>
          <br />
          <Link
            to="/login"
            className="auth-btn"
            style={{ display: "inline-block", width: "auto", padding: "0 32px", lineHeight: "46px", textDecoration: "none" }}
          >
            {t("auth.goToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Brand */}
        <div className="auth-brand">
          <BrandMark />
          <div className="auth-brand__name">3Cloud</div>
          <div className="auth-brand__tag">AI Token 聚合分发平台</div>
        </div>

        {/* Page Title */}
        <div className="auth-title">
          {t("auth.registerTitle")}
          <HelpIcon text={t("auth.registerHelp")} level="page" />
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div className="auth-field">
            <label>
              {t("auth.email")} <span style={{ color: "var(--color-danger-text)" }}>*</span>
              <HelpIcon text="用于登录和接收通知的邮箱地址" level="button" />
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
              <HelpIcon text="≥8位，字母+数字+特殊字符，推荐使用密码管理器生成" level="button" />
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="≥8位，字母+数字+特殊字符"
              required
              className="auth-input"
            />
            {/* Password Strength Bar */}
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    flex: 1, height: 4, borderRadius: 2,
                    background: i <= strength.score ? (strengthColors[strength.cls] ?? "var(--color-divider)") : "var(--color-divider)",
                    transition: "background .3s",
                  }}
                />
              ))}
            </div>
            <div style={{
              fontSize: 12, marginTop: 6,
              color: strength.cls ? (strengthColors[strength.cls] ?? "var(--color-text-secondary)") : "var(--color-text-secondary)",
            }}>
              强度：{strength.label}
            </div>
          </div>

          {/* Confirm Password */}
          <div className="auth-field">
            <label>
              {t("auth.confirmPassword")} <span style={{ color: "var(--color-danger-text)" }}>*</span>
              <HelpIcon text="请再次输入密码以确认" level="button" />
            </label>
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="再次输入密码"
              required
              className={`auth-input ${pwMatch === false ? "auth-input--error" : ""}`}
            />
            {pwMatch === false && (
              <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 4 }}>
                {t("auth.passwordMismatch")}
              </div>
            )}
          </div>

          {/* Invite Code (optional) */}
          <div className="auth-field">
            <label>
              邀请码（选填）
              <HelpIcon text="由代理商提供的邀请码（选填）。邀请仅作拉新激励，不自动建立客户归属；客户归属以平台报备审核划拨为准。" level="button" />
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="选填，如有邀请码可输入"
              className="auth-input"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={registerMut.isPending}
            className="auth-btn"
          >
            {registerMut.isPending ? t("auth.registering") : t("auth.register")}
          </button>
          {registerMut.isError && (
            <div className="auth-alert" style={{ marginTop: 12 }}>
              <span>{extractError(registerMut.error)}</span>
            </div>
          )}
        </form>

        <div className="auth-foot">
          {t("auth.haveAccount")} <Link to="/login">{t("auth.loginNow")}</Link>
        </div>
      </div>
    </div>
  );
}

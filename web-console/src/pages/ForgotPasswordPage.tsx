import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { extractError } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";
import "./auth.css";

/** 步骤状态 */
type Step = "send" | "sent" | "reset";

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

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("send");
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const { toast } = useToast();

  // 后端缺失：/auth/forgot-password 接口 — 发重置链接
  const sendMut = useMutation({
    mutationFn: async () =>
      // (await api.post("/auth/forgot-password", { email })).data;
      // 模拟成功（后端缺失）
      Promise.resolve({ data: { message: "重置链接已发送" } }),
    onSuccess: () => {
      setSentEmail(email);
      setStep("sent");
    },
    onError: (err) => toast.error(extractError(err)),
  });

  // 后端缺失：/auth/reset-password 接口 — 带 token 重置
  const resetMut = useMutation({
    mutationFn: async () =>
      // (await api.post("/auth/reset-password", { token: "from-url", password: newPassword })).data;
      Promise.resolve({ data: { message: "密码已重置" } }),
    onSuccess: () => {
      toast.success("密码已重置，请重新登录");
      // 跳回登录
      window.location.href = "/app/login";
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("请输入有效的邮箱地址");
      return;
    }
    sendMut.mutate();
  };

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("新密码至少8位，含字母和数字");
      return;
    }
    if (newPassword !== confirmPwd) {
      toast.error("两次密码不一致");
      return;
    }
    resetMut.mutate();
  };

  // === Step: 已发送成功 ===
  if (step === "sent") {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <div className="auth-success-icon"><MailIcon /></div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text)", marginBottom: 8 }}>
            重置链接已发送
          </div>
          <div style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            请前往邮箱<br />
            <strong style={{ color: "var(--color-text)" }}>{sentEmail}</strong><br /><br />
            点击邮件中的链接重置密码<br />
            链接有效时间由后台配置
          </div>
          <br />
          <Link
            to="/login"
            className="auth-btn"
            style={{ display: "inline-block", width: "auto", padding: "0 32px", lineHeight: "46px", textDecoration: "none" }}
          >
            返回登录
          </Link>
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={() => { setStep("send"); }}
              className="auth-link"
              style={{ background: "none", border: "none", fontSize: 13, cursor: "pointer" }}
            >
              未收到邮件？重新发送
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === Step: 重置密码（从邮箱链接进入） ===
  if (step === "reset") {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <BrandMark />
            <div className="auth-brand__name">浩寅云</div>
          </div>
          <div className="auth-title">
            重置密码
            <HelpIcon text="新密码至少8位，含字母和数字，重置后所有旧会话将失效" level="page" />
          </div>
          <form onSubmit={handleReset}>
            <div className="auth-field">
              <label>
                新密码 <span style={{ color: "var(--color-danger-text)" }}>*</span>
                <HelpIcon text="≥8位，字母+数字+特殊字符" level="button" />
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="≥8位，字母+数字+特殊字符"
                required
                className="auth-input"
              />
            </div>
            <div className="auth-field">
              <label>
                确认新密码 <span style={{ color: "var(--color-danger-text)" }}>*</span>
                <HelpIcon text="再次输入新密码确认" level="button" />
              </label>
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="再次输入新密码"
                required
                className="auth-input"
              />
            </div>
            <button
              type="submit"
              disabled={resetMut.isPending}
              className="auth-btn"
            >
              {resetMut.isPending ? "重置中..." : "确认重置"}
            </button>
          </form>
          <div className="auth-foot">
            <Link to="/login">← 返回登录</Link>
          </div>
        </div>
      </div>
    );
  }

  // === Step: 发送重置链接（默认） ===
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <BrandMark />
          <div className="auth-brand__name">浩寅云</div>
        </div>
        <div className="auth-title">
          忘记密码
          <HelpIcon text="输入注册邮箱，系统将发送重置链接，点击链接设置新密码" level="page" />
        </div>
        <form onSubmit={handleSend}>
          <div className="auth-field">
            <label>
              邮箱 <span style={{ color: "var(--color-danger-text)" }}>*</span>
              <HelpIcon text="输入注册时使用的邮箱地址" level="button" />
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
          <button
            type="submit"
            disabled={sendMut.isPending}
            className="auth-btn"
          >
            {sendMut.isPending ? "发送中..." : "发送重置链接"}
          </button>
        </form>
        <div className="auth-foot">
          <Link to="/login">← 返回登录</Link>
        </div>
      </div>
    </div>
  );
}

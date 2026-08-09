import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

/** 步骤状态 */
type Step = "send" | "sent" | "reset";

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
      toast.success("✅ 密码已重置，请重新登录");
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

  const wrapStyle: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--color-bg)",
    fontFamily: 'var(--font-family, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif)',
  };

  const containerStyle: React.CSSProperties = {
    width: 420, background: "var(--color-panel)", borderRadius: 16,
    padding: "40px 32px", boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", height: 40, border: "1px solid var(--color-border)",
    borderRadius: 8, padding: "0 12px", fontSize: 14,
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };

  // === Step: 已发送成功 ===
  if (step === "sent") {
    return (
      <div style={wrapStyle}>
        <div style={{ ...containerStyle, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
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
            style={{
              display: "inline-block", padding: "10px 32px",
              background: "var(--color-primary)", color: "#fff",
              borderRadius: 8, fontSize: 16, textDecoration: "none",
            }}
          >
            返回登录
          </Link>
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => { setStep("send"); }}
              style={{
                background: "none", border: "none", color: "var(--color-primary)",
                fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}
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
      <div style={wrapStyle}>
        <div style={containerStyle}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <h1 style={{ fontSize: 24, color: "var(--color-text)", margin: 0 }}>🚀 3cloud</h1>
          </div>
          <div style={{
            fontSize: 18, fontWeight: 600, color: "var(--color-text)", marginBottom: 24,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            重置密码
            <HelpIcon text="新密码至少8位，含字母和数字，重置后所有旧会话将失效" level="page" />
          </div>
          <form onSubmit={handleReset}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
                新密码 <span style={{ color: "var(--color-danger-text)" }}>*</span>
                <HelpIcon text="≥8位，字母+数字+特殊字符" level="button" />
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="≥8位，字母+数字+特殊字符"
                required
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
                确认新密码 <span style={{ color: "var(--color-danger-text)" }}>*</span>
                <HelpIcon text="再次输入新密码确认" level="button" />
              </label>
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="再次输入新密码"
                required
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              disabled={resetMut.isPending}
              style={{
                width: "100%", height: 44,
                background: resetMut.isPending ? "#a0b4f9" : "var(--color-primary)",
                color: "#fff", border: "none", borderRadius: 8, fontSize: 16,
                cursor: resetMut.isPending ? "not-allowed" : "pointer", marginTop: 8,
                fontFamily: "inherit",
              }}
            >
              {resetMut.isPending ? "重置中..." : "确认重置"}
            </button>
          </form>
          <Link
            to="/login"
            style={{
              display: "block", textAlign: "center", marginTop: 16,
              fontSize: 13, color: "var(--color-text-secondary)", textDecoration: "none",
            }}
          >
            ← 返回登录
          </Link>
        </div>
      </div>
    );
  }

  // === Step: 发送重置链接（默认） ===
  return (
    <div style={wrapStyle}>
      <div style={containerStyle}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, color: "var(--color-text)", margin: 0 }}>🚀 3cloud</h1>
        </div>
        <div style={{
          fontSize: 18, fontWeight: 600, color: "var(--color-text)", marginBottom: 24,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          忘记密码
          <HelpIcon text="输入注册邮箱，系统将发送重置链接，点击链接设置新密码" level="page" />
        </div>
        <form onSubmit={handleSend}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
              邮箱 <span style={{ color: "var(--color-danger-text)" }}>*</span>
              <HelpIcon text="输入注册时使用的邮箱地址" level="button" />
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
          <button
            type="submit"
            disabled={sendMut.isPending}
            style={{
              width: "100%", height: 44,
              background: sendMut.isPending ? "#a0b4f9" : "var(--color-primary)",
              color: "#fff", border: "none", borderRadius: 8, fontSize: 16,
              cursor: sendMut.isPending ? "not-allowed" : "pointer", marginTop: 8,
              fontFamily: "inherit",
            }}
          >
            {sendMut.isPending ? "发送中..." : "发送重置链接"}
          </button>
        </form>
        <Link
          to="/login"
          style={{
            display: "block", textAlign: "center", marginTop: 16,
            fontSize: 13, color: "var(--color-text-secondary)", textDecoration: "none",
          }}
        >
          ← 返回登录
        </Link>
      </div>
    </div>
  );
}

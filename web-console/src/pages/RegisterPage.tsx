import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

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
  medium: "#ffa726",
  strong: "#66bb6a",
};

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  // P2-2 邀请链接落地：/?invite_code=XXX 自动预填邀请码（代理商分享链接打开注册页）
  const [searchParams] = useSearchParams();
  const [inviteCode, setInviteCode] = useState(searchParams.get("invite_code") ?? "");
  const [successEmail, setSuccessEmail] = useState("");
  const { toast } = useToast();

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
      toast.error("密码至少 8 位，含字母、数字和特殊字符");
      return;
    }
    if (password !== confirmPwd) {
      toast.error("两次密码不一致");
      return;
    }
    registerMut.mutate();
  };

  // 注册成功 → 显示激活邮件提示
  if (successEmail) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--color-bg)",
        fontFamily: 'var(--font-family, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif)',
      }}>
        <div style={{
          width: 420, background: "var(--color-panel)", borderRadius: 16,
          padding: "40px 32px", boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text)", marginBottom: 8 }}>
            注册成功！
          </div>
          <div style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            已发送激活链接至<br />
            <strong style={{ color: "var(--color-text)" }}>{successEmail}</strong><br /><br />
            请前往邮箱点击链接完成激活<br />
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
            前往登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--color-bg)",
      fontFamily: 'var(--font-family, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif)',
    }}>
      <div style={{
        width: 420, background: "var(--color-panel)", borderRadius: 16,
        padding: "40px 32px", boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
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
          fontSize: 18, fontWeight: 600, color: "var(--color-text)", marginBottom: 24,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          注册账号
          <HelpIcon text="注册账号后即可使用 API Token 服务" level="page" />
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
              邮箱 <span style={{ color: "var(--color-danger-text)" }}>*</span>
              <HelpIcon text="用于登录和接收通知的邮箱地址" level="button" />
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
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
              密码 <span style={{ color: "var(--color-danger-text)" }}>*</span>
              <HelpIcon text="≥8位，字母+数字+特殊字符，推荐使用密码管理器生成" level="button" />
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="≥8位，字母+数字+特殊字符"
              required
              style={{
                width: "100%", height: 40, border: "1px solid var(--color-border)",
                borderRadius: 8, padding: "0 12px", fontSize: 14,
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
            {/* Password Strength Bar */}
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    flex: 1, height: 4, borderRadius: 2,
                    background: i <= strength.score ? (strengthColors[strength.cls] ?? "#eee") : "#eee",
                    transition: "background .3s",
                  }}
                />
              ))}
            </div>
            <div style={{
              fontSize: 12, marginTop: 4,
              color: strength.cls ? (strengthColors[strength.cls] ?? "var(--color-text-secondary)") : "var(--color-text-secondary)",
            }}>
              强度：{strength.label}
            </div>
          </div>

          {/* Confirm Password */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
              确认密码 <span style={{ color: "var(--color-danger-text)" }}>*</span>
              <HelpIcon text="请再次输入密码以确认" level="button" />
            </label>
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="再次输入密码"
              required
              style={{
                width: "100%", height: 40, border: `1px solid ${pwMatch === false ? "var(--color-danger-text)" : "var(--color-border)"}`,
                borderRadius: 8, padding: "0 12px", fontSize: 14,
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
            {pwMatch === false && (
              <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 4 }}>
                两次密码不一致
              </div>
            )}
          </div>

          {/* Invite Code (optional) */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
              邀请码（选填）
              <HelpIcon text="由代理商提供的邀请码（选填）。邀请仅作拉新激励，不自动建立客户归属；客户归属以平台报备审核划拨为准。" level="button" />
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="选填，如有邀请码可输入"
              style={{
                width: "100%", height: 40, border: "1px solid var(--color-border)",
                borderRadius: 8, padding: "0 12px", fontSize: 14,
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={registerMut.isPending}
            style={{
              width: "100%", height: 44,
              background: registerMut.isPending ? "#a0b4f9" : "var(--color-primary)",
              color: "#fff", border: "none", borderRadius: 8, fontSize: 16,
              cursor: registerMut.isPending ? "not-allowed" : "pointer", marginTop: 8,
              fontFamily: "inherit",
            }}
          >
            {registerMut.isPending ? "注册中..." : "注册"}
          </button>
          {registerMut.isError && (
            <div style={{
              marginTop: 12, padding: "10px 12px", background: "#fff1f0",
              border: "1px solid #ffccc7", borderRadius: 6,
              fontSize: 13, color: "#cf1322",
            }}>
              ❌ {extractError(registerMut.error)}
            </div>
          )}
        </form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--color-text-secondary)" }}>
          已有账号？<Link to="/login" style={{ color: "var(--color-primary)", textDecoration: "none" }}>立即登录</Link>
        </div>
      </div>
    </div>
  );
}

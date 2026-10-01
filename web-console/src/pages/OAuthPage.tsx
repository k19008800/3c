import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { HelpIcon, useToast } from "@3cloud/shared-ui";
import "./auth.css";

/**
 * 第三方登录绑定 — GitHub OAuth 真实对接
 *
 * 后端已实现（见 api/src/routes/oauth.ts）：
 * - GET /auth/oauth/github/url      → { url }，跳转 GitHub 授权页
 * - GET /auth/oauth/github/callback → { token, refreshToken, expiresIn, user }（code 换 JWT）
 *
 * 后端缺失（前端暂不调用，避免 404）：
 * - GET  /auth/oauth/bindings            — 绑定列表查询
 * - POST /auth/oauth/{provider}/bind     — 发起绑定
 * - POST /auth/oauth/unbind              — 解绑
 * 因此本页只做 GitHub 快捷登录，微信 / Telegram / Google 标注"即将上线"。
 *
 * 回调说明：GitHub 授权后由后端 redirect_uri（OAUTH_REDIRECT_BASE + /api/v1/auth/oauth/github/callback）
 * 直接返回 JSON。本页同时支持以 ?code=&state= 参数打开（SPA 侧回调入口）：
 * 拿到 code 后调用回调端点换 token 并写入会话。若 OAUTH_REDIRECT_BASE 指向 API 源，
 * 回调 JSON 会直接展示在浏览器（后端 P2 应改为跳转 SPA 并携带 code，见 oauth.ts 注释）。
 */

interface GitHubCallbackUser {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/** 平台列表：available=false 表示后端未实现，UI 置灰"即将上线" */
const PROVIDERS: Array<{ provider: string; name: string; available: boolean }> = [
  { provider: "github", name: "GitHub", available: true },
  { provider: "wechat", name: "微信", available: false },
  { provider: "telegram", name: "Telegram", available: false },
  { provider: "google", name: "Google", available: false },
];

/* 第三方平台 SVG 图标（替代 emoji） */
function ProviderIcon({ provider, active }: { provider: string; active: boolean }) {
  const props = { width: 22, height: 22, viewBox: "0 0 24 24", fill: active ? "var(--color-primary)" : "var(--color-text-muted)", "aria-hidden": true } as const;
  if (provider === "github")
    return (<svg {...props}><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.75 2.7 1.25 3.36.95.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.14c0 .3.2.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" /></svg>);
  if (provider === "wechat")
    return (<svg {...props}><path d="M9.5 4C5.36 4 2 6.9 2 10.47c0 2.04 1.1 3.86 2.83 5.03l-.7 2.1 2.45-1.23c.65.18 1.34.28 2.05.3a5.4 5.4 0 0 1-.2-1.46c0-3.13 2.98-5.66 6.66-5.66.24 0 .47.01.7.03C15.1 6.2 12.56 4 9.5 4ZM7.2 8.6a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Zm4.6 0a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8ZM15.6 10.6c-3.2 0-5.8 2.18-5.8 4.87 0 2.68 2.6 4.86 5.8 4.86.63 0 1.24-.09 1.8-.26l2.13 1.07-.6-1.82c1.43-.98 2.37-2.5 2.37-4.19 0-2.69-2.6-4.86-5.7-4.86Zm-1.9 2.7a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm3.7 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Z" /></svg>);
  if (provider === "telegram")
    return (<svg {...props}><path d="M21.9 4.3 19.1 19.1c-.2 1-.8 1.2-1.6.8l-4.5-3.3-2.1 2.1c-.2.2-.4.4-.9.4l.3-4.6 8.4-7.6c.4-.3-.1-.5-.6-.2L6.2 13.2 1.7 11.8c-1-.3-1-1 .2-1.4l17.6-6.8c.8-.3 1.5.2 1.4.7Z" /></svg>);
  return (<svg {...props}><path d="M21.6 12.23c0-.68-.06-1.36-.19-2H12v3.83h5.39a4.55 4.55 0 0 1-1.97 2.98v2.46h3.19c1.86-1.72 2.99-4.26 2.99-7.27Z" /><path d="M12 22c2.67 0 4.92-.89 6.56-2.43l-3.19-2.46c-.89.6-2.03.95-3.37.95-2.59 0-4.79-1.75-5.57-4.1H3.12v2.53A10 10 0 0 0 12 22Z" opacity=".85" /><path d="M6.43 13.96a6 6 0 0 1 0-3.92V7.5H3.12a10 10 0 0 0 0 9l3.31-2.54Z" opacity=".7" /></svg>);
}

const card: React.CSSProperties = {
  background: "var(--color-panel)", borderRadius: 12, marginBottom: 20,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};
const panelHeader: React.CSSProperties = {
  padding: "14px 20px", borderBottom: "1px solid var(--color-divider)",
  display: "flex", justifyContent: "space-between", alignItems: "center",
};
const panelBody: React.CSSProperties = { padding: 20 };
const btn: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 8, border: "1px solid var(--color-border)",
  background: "var(--color-panel)", color: "var(--color-text)", fontSize: 14,
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};
const btnPrimary: React.CSSProperties = { ...btn, border: "none", background: "var(--color-primary)", color: "#fff" };

export default function OAuthPage() {
  const { toast } = useToast();
  const setSession = useAuthStore((s) => s.setSession);
  const [githubLoading, setGithubLoading] = useState(false);
  const [callbackUser, setCallbackUser] = useState<GitHubCallbackUser | null>(null);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  /** 已处理过的 GitHub code（一次性，防 StrictMode 重复消费） */
  const processedCodeRef = useRef<string | null>(null);

  // SPA 侧回调入口：页面以 ?code=&state=（或 ?error=）打开时，调用后端回调端点换 JWT
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error) {
      setCallbackError(`GitHub 授权失败：${error}（可能已取消授权）`);
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (!code) return;

    // GitHub code 一次性：StrictMode 下 effect 会执行两次，用 ref 保证只处理一次
    if (processedCodeRef.current === code) return;
    processedCodeRef.current = code;

    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ token: string; refreshToken: string; expiresIn: number; user: GitHubCallbackUser }>(
          "/auth/oauth/github/callback",
          { params: { code, state } },
        );
        const { token, user } = res.data;
        // 写入会话（App.tsx 侦测 token 变化后会自动 fetchMe 补齐完整用户信息）
        setSession(token, user);
        if (!cancelled) {
          setCallbackUser(user);
          toast.success(`GitHub 登录成功：${user.name || user.email || `#${user.id}`}`);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = extractError(err);
          setCallbackError(msg);
          toast.error(msg);
        }
      } finally {
        // 清理 URL 上的 code/state，避免刷新重复消费一次性 code
        if (!cancelled) window.history.replaceState({}, "", window.location.pathname);
      }
    })();
    return () => { cancelled = true; };
  }, [setSession, toast]);

  const githubLoginMut = useMutation({
    mutationFn: async () => {
      const res = await api.get<{ url: string }>("/auth/oauth/github/url");
      return res.data.url;
    },
    onSuccess: (url) => {
      // 整页跳转 GitHub 授权页，授权完成后由后端回调返回 JWT
      window.location.href = url;
    },
    onError: (err) => {
      toast.error(extractError(err));
      setGithubLoading(false);
    },
  });

  const handleGitHubLogin = () => {
    setGithubLoading(true);
    githubLoginMut.mutate();
  };

  return (
    <div className="auth-page" style={{ display: "block", padding: "40px 24px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8, fontSize: 22, fontWeight: 700 }}>
        第三方登录绑定
        <HelpIcon text="绑定第三方账号后可使用对应平台快捷登录。当前支持 GitHub，微信 / Telegram / Google 即将上线。" level="page" />
      </h2>
      <p style={{ color: "var(--color-text-secondary)", marginTop: 0, fontSize: 13, marginBottom: 20 }}>
        管理您的第三方 OAuth 登录方式，每个平台只能绑定一个账号
      </p>

      {/* 回调结果展示：后端回调返回的 user 直接展示 */}
      {callbackUser && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 8, background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)", marginBottom: 20, fontSize: 13, color: "var(--color-text)" }}>
          {callbackUser.avatarUrl ? (
            <img src={callbackUser.avatarUrl} alt="avatar" style={{ width: 36, height: 36, borderRadius: "50%" }} />
          ) : (
            <ProviderIcon provider="github" active />
          )}
          <span>
            <strong>{callbackUser.name || callbackUser.email || `GitHub 用户 #${callbackUser.id}`}</strong> 已通过 GitHub 登录，账号已自动绑定，请前往控制台继续操作。
          </span>
        </div>
      )}
      {callbackError && (
        <div className="auth-alert" style={{ marginBottom: 20 }}>
          <span>{callbackError}</span>
        </div>
      )}

      {/* Info Banner */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 8, background: "var(--color-info-bg)", border: "1px solid var(--color-info-border)", marginBottom: 20, fontSize: 13, color: "var(--color-text)" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-info-text)" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        <span>绑定第三方账号后，您可以使用对应平台一键登录，无需每次输入密码。</span>
      </div>

      {/* Bindings List */}
      <div style={card}>
        <div style={panelHeader}>
          <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            支持的第三方平台
            <HelpIcon text="GitHub 已支持快捷登录；绑定列表 / 解绑等管理功能待后端提供接口后开放" level="button" />
          </h3>
        </div>
        <div style={panelBody}>
          {PROVIDERS.map((p, idx) => (
            <div
              key={p.provider}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 0", borderBottom: idx < PROVIDERS.length - 1 ? "1px solid var(--color-divider)" : "none",
              }}
            >
              {/* Provider Info */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                  background: p.available ? "var(--color-primary-light)" : "var(--color-divider-light)",
                  transition: "background .2s",
                }}>
                  <ProviderIcon provider={p.provider} active={p.available} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text)", marginBottom: 2 }}>
                    {p.name}
                    <HelpIcon
                      text={p.available
                        ? "GitHub 快捷登录：跳转授权页，授权后自动绑定当前邮箱账号或注册新账号"
                        : `${p.name} 快捷登录正在开发中，敬请期待`}
                      level="button"
                    />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {p.available
                      ? "未绑定 — 使用 GitHub 账号快捷登录"
                      : "即将上线 — 敬请期待"}
                  </div>
                </div>
              </div>

              {/* Status + Action */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 12, fontSize: 12,
                  background: p.available ? "var(--color-success-bg)" : "var(--color-divider-light)",
                  color: p.available ? "var(--color-success-text)" : "var(--color-text-secondary)",
                  border: `1px solid ${p.available ? "var(--color-success-border)" : "var(--color-border)"}`,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.available ? "var(--color-success-text)" : "var(--color-text-disabled)" }} />
                  {p.available ? "支持" : "即将上线"}
                </span>
                {p.available ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={handleGitHubLogin}
                      disabled={githubLoading}
                      style={{
                        ...btnPrimary,
                        padding: "4px 14px", fontSize: 12, borderRadius: 6,
                        opacity: githubLoading ? 0.6 : 1,
                        cursor: githubLoading ? "wait" : "pointer",
                      }}
                    >
                      {githubLoading ? "跳转中…" : "GitHub 登录"}
                    </button>
                    <HelpIcon text="跳转到 GitHub 授权页完成快捷登录，授权后自动绑定账号" />
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      disabled
                      style={{
                        ...btn,
                        padding: "4px 14px", fontSize: 12, borderRadius: 6,
                        opacity: 0.5, cursor: "not-allowed",
                      }}
                    >
                      即将上线
                    </button>
                    <HelpIcon text={`${p.name} 快捷登录正在开发中，敬请期待`} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ / Help */}
      <div style={card}>
        <div style={panelHeader}>
          <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            常见问题
            <HelpIcon text="关于第三方登录绑定的常见问题解答" level="button" />
          </h3>
        </div>
        <div style={panelBody}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { q: "绑定第三方账号是否安全？", a: "我们采用 OAuth 2.0 标准协议，仅获取您的基本信息用于登录验证，不会获取您的密码或敏感数据。" },
              { q: "可以绑定多个平台吗？", a: "可以。您可以同时绑定 GitHub、微信、Telegram、Google 等多个平台，每个平台只能绑定一个账号。" },
              { q: "解绑后会有什么影响？", a: "解绑后您将无法使用该平台快捷登录，但已有的账号数据不受影响。建议至少保留一个绑定方式。" },
              { q: "绑定失败怎么办？", a: "请检查网络连接和目标平台账号状态。如持续失败，请联系客服或提交工单。" },
            ].map((faq, i) => (
              <div key={i}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text)", marginBottom: 4 }}>
                  Q: {faq.q}
                </div>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                  A: {faq.a}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 后端能力说明 */}
      <div style={{ background: "var(--color-warning-bg)", padding: 14, borderRadius: 8, border: "1px solid var(--color-warning-border)", fontSize: 13, color: "var(--color-warning-text)", marginTop: 16, lineHeight: 1.6 }}>
        当前后端仅实现 GitHub 登录（/auth/oauth/github/url + callback）。绑定列表 / 绑定 / 解绑端点（/auth/oauth/bindings 等）待后端补充后，本页将开放绑定管理。
      </div>
      </div>
    </div>
  );
}

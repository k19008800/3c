import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, useToast } from "@3cloud/shared-ui";

/**
 * 第三方登录绑定 — 对齐原型 portal-oauth.html 的 OAuth 绑定管理
 * 独立页面：管理 GitHub / 微信 / Telegram / Google 绑定
 * 
 * 后端缺失：/auth/oauth/bindings 获取绑定列表、/auth/oauth/bind 发起绑定、/auth/oauth/unbind 解绑
 */

interface OAuthBinding {
  provider: string;
  name: string;
  icon: string;
  bound: boolean;
  bound_info?: string;  // 如 "用户 wx_zh_8866"
  bound_at?: string;
}

const PROVIDERS: OAuthBinding[] = [
  { provider: "github", name: "GitHub", icon: "🐙", bound: false },
  { provider: "wechat", name: "微信", icon: "💬", bound: false },
  { provider: "telegram", name: "Telegram", icon: "✈️", bound: false },
  { provider: "google", name: "Google", icon: "🔵", bound: false },
];

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
const btnDanger: React.CSSProperties = { ...btn, border: "1px solid var(--color-danger-text)", color: "var(--color-danger-text)" };

export default function OAuthPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [bindings, setBindings] = useState<OAuthBinding[]>(PROVIDERS);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  // 后端缺失：获取OAuth绑定列表
  // const bindingsQ = useQuery({
  //   queryKey: ["me-oauth-bindings"],
  //   queryFn: async () => (await api.get<{ data: OAuthBinding[] }>("/auth/oauth/bindings")).data.data,
  // });
  // useEffect(() => {
  //   if (bindingsQ.data) setBindings(bindingsQ.data);
  // }, [bindingsQ.data]);

  const bindMut = useMutation({
    mutationFn: async (provider: string) => {
      // 后端缺失：/auth/oauth/{provider}/bind
      // const res = await api.post(`/auth/oauth/${provider}/bind`);
      // return res.data;
      // 模拟成功
      await new Promise((r) => setTimeout(r, 1500));
      return { data: { bind_info: `${provider}_user_${Math.floor(Math.random() * 9000 + 1000)}` } };
    },
    onSuccess: (data, provider) => {
      setBindings((prev) =>
        prev.map((b) =>
          b.provider === provider
            ? { ...b, bound: true, bound_info: data.data?.bind_info, bound_at: new Date().toISOString() }
            : b
        )
      );
      toast.success(`${PROVIDERS.find((p) => p.provider === provider)?.name ?? provider} 绑定成功`);
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const unbindMut = useMutation({
    mutationFn: async (provider: string) => {
      // 后端缺失：/auth/oauth/{provider}/unbind
      // await api.post(`/auth/oauth/${provider}/unbind`);
      await new Promise((r) => setTimeout(r, 800));
    },
    onSuccess: (_data, provider) => {
      setBindings((prev) =>
        prev.map((b) =>
          b.provider === provider ? { ...b, bound: false, bound_info: undefined, bound_at: undefined } : b
        )
      );
      toast.success(`${PROVIDERS.find((p) => p.provider === provider)?.name ?? provider} 已解绑`);
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const handleToggle = (provider: string) => {
    const b = bindings.find((b) => b.provider === provider);
    if (!b) return;

    setLoadingProvider(provider);

    if (b.bound) {
      // 解绑
      if (!window.confirm(`确定要解绑 ${b.name} 吗？\n解绑后将无法使用 ${b.name} 快捷登录。`)) {
        setLoadingProvider(null);
        return;
      }
      unbindMut.mutate(provider, { onSettled: () => setLoadingProvider(null) });
    } else {
      // 绑定
      // 后端缺失：OAuth 跳转流程
      // window.location.href = `/api/v1/auth/oauth/${provider}/bind`;
      bindMut.mutate(provider, { onSettled: () => setLoadingProvider(null) });
    }
  };

  /* ==================== Two-Factor Verification (from portal-oauth.html which is actually a 2FA flow) ==================== */
  return (
    <div>
      <h2 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
        第三方登录绑定
        <HelpIcon text="绑定第三方账号后可使用对应平台快捷登录。支持 GitHub、微信、Telegram、Google 等平台。" level="page" />
      </h2>
      <p style={{ color: "var(--color-text-secondary)", marginTop: 0, fontSize: 13, marginBottom: 20 }}>
        管理您的第三方 OAuth 登录方式，每个平台只能绑定一个账号
      </p>

      {/* Info Banner */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 8, background: "var(--color-primary-light)", border: "1px solid rgba(79,110,247,0.2)", marginBottom: 20, fontSize: 13, color: "var(--color-text)" }}>
        <span style={{ fontSize: 18 }}>🔒</span>
        <span>绑定第三方账号后，您可以使用对应平台一键登录，无需每次输入密码。</span>
      </div>

      {/* Bindings List */}
      <div style={card}>
        <div style={panelHeader}>
          <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            已绑定的平台
            <HelpIcon text="管理已绑定的第三方登录方式，您可以随时添加新的绑定或解绑不再使用的平台" level="button" />
          </h3>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            已绑定 {bindings.filter((b) => b.bound).length}/{bindings.length} 个
          </span>
        </div>
        <div style={panelBody}>
          {bindings.map((p, idx) => (
            <div
              key={p.provider}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 0", borderBottom: idx < bindings.length - 1 ? "1px solid var(--color-divider)" : "none",
              }}
            >
              {/* Provider Info */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, background: p.bound ? "var(--color-primary-light)" : "var(--color-divider-light)",
                  transition: "background .2s",
                }}>
                  {p.icon}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text)", marginBottom: 2 }}>
                    {p.name}
                    <HelpIcon
                      text={p.bound
                        ? `已绑定 ${p.name} 账号 ${p.bound_info ?? ""}，可使用 ${p.name} 快捷登录`
                        : `绑定 ${p.name} 账号以使用快捷登录功能`}
                      level="button"
                    />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {p.bound
                      ? `已绑定 — ${p.bound_info ?? ""}${p.bound_at ? ` · ${new Date(p.bound_at).toLocaleDateString("zh-CN")}` : ""}`
                      : `未绑定 — 使用 ${p.name} 账号快捷登录`}
                  </div>
                </div>
              </div>

              {/* Status + Action */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 12, fontSize: 12,
                  background: p.bound ? "rgba(102,187,106,0.1)" : "var(--color-divider-light)",
                  color: p.bound ? "#66bb6a" : "var(--color-text-secondary)",
                  border: `1px solid ${p.bound ? "rgba(102,187,106,0.3)" : "var(--color-border)"}`,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.bound ? "#66bb6a" : "#ccc" }} />
                  {p.bound ? "已绑定" : "未绑定"}
                </span>
                <button
                  onClick={() => handleToggle(p.provider)}
                  disabled={loadingProvider === p.provider}
                  style={{
                    ...(p.bound ? btnDanger : btnPrimary),
                    padding: "4px 14px", fontSize: 12, borderRadius: 6,
                    opacity: loadingProvider === p.provider ? 0.6 : 1,
                    cursor: loadingProvider === p.provider ? "wait" : "pointer",
                  }}
                >
                  {loadingProvider === p.provider
                    ? (p.bound ? "解绑中…" : "绑定中…")
                    : (p.bound ? "解绑" : "绑定")}
                </button>
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

      {/* Note about the portal-oauth.html being a 2FA prototype */}
      <div style={{ background: "var(--color-warning-bg)", padding: 14, borderRadius: 8, border: "1px solid var(--color-warning-border)", fontSize: 13, color: "var(--color-warning-text)", marginTop: 16 }}>
        💡 注意：原型 portal-oauth.html 实际是一个"两步验证"页面（TOTP/Passkey/恢复码验证场景），其功能已整合到 <strong>安全中心 → 两步验证</strong> 标签。本页面聚焦第三方 OAuth 登录绑定管理。
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

const cfgSection: React.CSSProperties = { background: "var(--color-panel)", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const cfgRow: React.CSSProperties = { display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f5f5f5", gap: 12 };
const cfgLabel: React.CSSProperties = { width: 160, fontSize: 13, color: "#666", flexShrink: 0 };
const cfgInput: React.CSSProperties = { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 13, width: 200 };
const toggleTrack: React.CSSProperties = { width: 44, height: 24, borderRadius: 12, background: "#d9d9d9", position: "relative", cursor: "pointer", transition: "background .2s", display: "inline-flex", alignItems: "center", flexShrink: 0 };
const toggleDot: React.CSSProperties = { width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: 3, transition: "transform .2s" };

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ ...toggleTrack, background: on ? "#22c55e" : "#d9d9d9" }} onClick={() => onChange(!on)}>
      <div style={{ ...toggleDot, transform: on ? "translateX(20px)" : "translateX(0)" }} />
    </div>
  );
}

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const { pathname } = useLocation();
  // 依据路由映射初始 tab：/config/rate-limit→限流，其余（/config/site）→站点
  const [tab, setTab] = useState<"site" | "rate" | "security" | "feature" | "api">(pathname.includes("/rate-limit") ? "rate" : "site");
  const [loading, setLoading] = useState(false);

  // Site settings
  const [siteName, setSiteName] = useState("3Cloud");
  const [siteDesc, setSiteDesc] = useState("AI模型聚合平台");
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [companyName, setCompanyName] = useState("3Cloud Technology");
  const [icpNo, setIcpNo] = useState("");
  const [icpLink, setIcpLink] = useState("");
  const [policeIcp, setPoliceIcp] = useState("");
  const [contactEmail, setContactEmail] = useState("support@unmisa.com");
  const [contactPhone, setContactPhone] = useState("");
  const [copyright, setCopyright] = useState("");
  const [wechatQrUrl, setWechatQrUrl] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Rate limits
  const [globalRpm, setGlobalRpm] = useState(10000);
  const [globalTpm, setGlobalTpm] = useState(10000000);
  const [rateLimitEnabled, setRateLimitEnabled] = useState(true);

  // 客户基线限流（额度管理页 /admin/customers/quotas 读取）
  const [enterpriseRpm, setEnterpriseRpm] = useState(300);
  const [enterpriseTpm, setEnterpriseTpm] = useState(1000000);
  const [personalRpm, setPersonalRpm] = useState(60);
  const [personalTpm, setPersonalTpm] = useState(200000);

  // Security
  const [sessionTimeout, setSessionTimeout] = useState(1440);
  const [maxLoginAttempts, setMaxLoginAttempts] = useState(5);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [ipWhitelistEnabled, setIpWhitelistEnabled] = useState(false);
  const [ipWhitelist, setIpWhitelist] = useState("");

  // Feature flags
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [rechargeEnabled, setRechargeEnabled] = useState(true);
  const [withdrawEnabled, setWithdrawEnabled] = useState(true);

  // API 服务（对外 API 域名 → OpenAI/Anthropic 双 base_url）
  const [apiDomain, setApiDomain] = useState("api.unmisa.com");

  useEffect(() => {
    setLoading(true);
    api.get("/admin/settings").then(r => {
      const d = r.data?.data ?? {};
      setSiteName(d.site_name ?? "3Cloud");
      setSiteDesc(d.site_desc ?? "");
      setLogoUrl(d.site_logo_url ?? "");
      setFaviconUrl(d.site_favicon_url ?? "");
      setCompanyName(d.site_company_name ?? "3Cloud Technology");
      setIcpNo(d.site_icp ?? "");
      setIcpLink(d.site_icp_link ?? "");
      setPoliceIcp(d.site_police_icp ?? "");
      setContactEmail(d.site_contact_email ?? "support@unmisa.com");
      setContactPhone(d.site_contact_phone ?? "");
      setCopyright(d.site_copyright ?? "");
      setWechatQrUrl(d.site_wechat_qr_url ?? "");
      setFooterHtml(d.site_footer_html ?? "");
      setMaintenanceMode(d.maintenance_mode ?? false);
      setGlobalRpm(d.global_rpm ?? 10000);
      setGlobalTpm(d.global_tpm ?? 10000000);
      setRateLimitEnabled(d.rate_limit_enabled ?? true);
      setEnterpriseRpm(d.enterprise_rpm ?? 300);
      setEnterpriseTpm(d.enterprise_tpm ?? 1000000);
      setPersonalRpm(d.personal_rpm ?? 60);
      setPersonalTpm(d.personal_tpm ?? 200000);
      setSessionTimeout(d.session_timeout ?? 1440);
      setMaxLoginAttempts(d.max_login_attempts ?? 5);
      setMfaRequired(d.mfa_required ?? false);
      setIpWhitelistEnabled(d.ip_whitelist_enabled ?? false);
      setIpWhitelist(d.ip_whitelist ?? "");
      setRegistrationOpen(d.registration_open ?? true);
      setRechargeEnabled(d.recharge_enabled ?? true);
      setWithdrawEnabled(d.withdraw_enabled ?? true);
      setApiDomain(d.api_domain ?? "api.unmisa.com");
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function saveSite() {
    await api.put("/admin/settings/site", {
      site_name: siteName, site_desc: siteDesc, site_logo_url: logoUrl, site_favicon_url: faviconUrl,
      site_company_name: companyName, site_icp: icpNo, site_icp_link: icpLink, site_police_icp: policeIcp,
      site_contact_email: contactEmail, site_contact_phone: contactPhone,
      site_copyright: copyright, site_wechat_qr_url: wechatQrUrl, site_footer_html: footerHtml,
      maintenance_mode: maintenanceMode,
    });
    toast.success("站点设置已保存");
  }
  async function saveRate() {
    await api.put("/admin/settings/rate-limit", { rate_limit_enabled: rateLimitEnabled, global_rpm: globalRpm, global_tpm: globalTpm, enterprise_rpm: enterpriseRpm, enterprise_tpm: enterpriseTpm, personal_rpm: personalRpm, personal_tpm: personalTpm });
    toast.success("限流设置已保存");
  }
  async function saveSecurity() {
    await api.put("/admin/settings/security", { session_timeout: sessionTimeout, max_login_attempts: maxLoginAttempts, mfa_required: mfaRequired, ip_whitelist_enabled: ipWhitelistEnabled, ip_whitelist: ipWhitelist });
    toast.success("安全配置已保存");
  }
  async function saveFeature() {
    await api.put("/admin/settings/features", { registration_open: registrationOpen, recharge_enabled: rechargeEnabled, withdraw_enabled: withdrawEnabled });
    toast.success("功能开关已保存");
  }
  async function saveApi() {
    await api.put("/admin/settings/api", { api_domain: apiDomain.trim() });
    toast.success("API 域名已保存");
  }

  // 派生预览：域名或完整 origin → origin（含协议、去尾斜杠）
  const apiOrigin = (() => {
    const v = apiDomain.trim();
    if (!v) return "https://api.unmisa.com";
    return (v.includes("://") ? v : `https://${v}`).replace(/\/+$/, "");
  })();

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#888" }}>加载中…</div>;

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>⚙️</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>系统设置
          <HelpIcon text="配置平台全局设置：站点基本信息、限流规则、安全策略、功能开关。所有变更写入操作审计日志。" level="page" />
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["site","rate","security","feature","api"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 20px", borderRadius: 8, border: tab === t ? "2px solid #4f6ef7" : "1px solid var(--color-border)",
            background: tab === t ? "#eef2ff" : "var(--color-panel)", color: tab === t ? "#4f6ef7" : "#666",
            cursor: "pointer", fontWeight: 600, fontSize: 13,
          }}>
            {t === "site" ? "🌐 站点设置" : t === "rate" ? "🚦 限流设置" : t === "security" ? "🛡️ 安全策略" : t === "feature" ? "🔧 功能开关" : "🔌 API 服务"}
          </button>
        ))}
      </div>

      {tab === "site" && (
        <div style={cfgSection}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>🌐 站点基本信息 <HelpIcon text="配置平台对外展示的名称、描述、LOGO、ICP备案号及维护模式。保存后 Portal 门户实时生效。" /></h3>
          <div style={cfgRow}><span style={cfgLabel}>站点名称</span><input style={cfgInput} value={siteName} onChange={e => setSiteName(e.target.value)} /></div>
          <div style={cfgRow}><span style={cfgLabel}>站点描述</span><input style={{...cfgInput, width: 400}} value={siteDesc} onChange={e => setSiteDesc(e.target.value)} /></div>
          <div style={cfgRow}><span style={cfgLabel}>公司名称</span><input style={{...cfgInput, width: 400}} value={companyName} onChange={e => setCompanyName(e.target.value)} /></div>
          <div style={cfgRow}><span style={cfgLabel}>LOGO URL</span><input style={{...cfgInput, width: 400}} value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." /></div>
          <div style={cfgRow}><span style={cfgLabel}>Favicon URL</span><input style={{...cfgInput, width: 400}} value={faviconUrl} onChange={e => setFaviconUrl(e.target.value)} placeholder="https://.../favicon.ico" /></div>
          <div style={cfgRow}><span style={cfgLabel}>ICP备案号</span><input style={cfgInput} value={icpNo} onChange={e => setIcpNo(e.target.value)} placeholder="京ICP备XXXXXXXX号" /></div>
          <div style={cfgRow}><span style={cfgLabel}>ICP备案链接</span><input style={{...cfgInput, width: 300}} value={icpLink} onChange={e => setIcpLink(e.target.value)} placeholder="https://beian.miit.gov.cn/" /></div>
          <div style={cfgRow}><span style={cfgLabel}>公安备案号</span><input style={cfgInput} value={policeIcp} onChange={e => setPoliceIcp(e.target.value)} placeholder="京公网安备XXXXXXXX号" /></div>
          <div style={cfgRow}><span style={cfgLabel}>联系邮箱</span><input style={cfgInput} value={contactEmail} onChange={e => setContactEmail(e.target.value)} /></div>
          <div style={cfgRow}><span style={cfgLabel}>联系电话</span><input style={cfgInput} value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="如 400-xxx-xxxx" /></div>
          <div style={cfgRow}><span style={cfgLabel}>公众号二维码 URL</span><input style={{...cfgInput, width: 300}} value={wechatQrUrl} onChange={e => setWechatQrUrl(e.target.value)} placeholder="https://..." /></div>
          <div style={cfgRow}><span style={cfgLabel}>版权信息</span><input style={{...cfgInput, width: 300}} value={copyright} onChange={e => setCopyright(e.target.value)} placeholder="如 © 2026 3Cloud" /></div>
          <div style={cfgRow}>
            <span style={cfgLabel}>自定义 Footer HTML</span>
            <textarea style={{ ...cfgInput, width: 400, height: 60 }} value={footerHtml} onChange={e => setFooterHtml(e.target.value)} placeholder="留空则使用默认版权+备案渲染" />
          </div>
          <div style={cfgRow}>
            <span style={cfgLabel}>维护模式 <HelpIcon text="开启后仅管理员可访问，普通用户看到维护页面。" /></span>
            <Toggle on={maintenanceMode} onChange={setMaintenanceMode} />
            <span style={{ fontSize: 12, color: maintenanceMode ? "#e53935" : "#888" }}>{maintenanceMode ? "🔴 已开启" : "⚪ 已关闭"}</span>
          </div>
          <button onClick={saveSite} style={{ marginTop: 16, padding: "8px 24px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>保存站点设置</button>
        </div>
      )}

      {tab === "rate" && (
        <div style={cfgSection}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>🚦 全局限流配置 <HelpIcon text="按分钟限制全平台RPM(请求数)和TPM(Token数)，防止单一模型被恶意调用拖垮平台。0=不限制。" /></h3>
          <div style={cfgRow}>
            <span style={cfgLabel}>启用限流 <HelpIcon text="关闭后所有限流规则失效。" /></span>
            <Toggle on={rateLimitEnabled} onChange={setRateLimitEnabled} />
          </div>
          <div style={{...cfgRow, opacity: rateLimitEnabled ? 1 : 0.5}}>
            <span style={cfgLabel}>全局 RPM 上限</span>
            <input style={cfgInput} type="number" value={globalRpm} onChange={e => setGlobalRpm(Number(e.target.value))} disabled={!rateLimitEnabled} />
            <span style={{ fontSize: 12, color: "#888" }}>请求/分钟</span>
          </div>
          <div style={{...cfgRow, opacity: rateLimitEnabled ? 1 : 0.5}}>
            <span style={cfgLabel}>全局 TPM 上限</span>
            <input style={cfgInput} type="number" value={globalTpm} onChange={e => setGlobalTpm(Number(e.target.value))} disabled={!rateLimitEnabled} />
            <span style={{ fontSize: 12, color: "#888" }}>Token/分钟</span>
          </div>

          <div style={{ margin: "20px 0 6px", fontSize: 13, fontWeight: 600, color: "#333" }}>
            🧮 客户基线限流 <HelpIcon text="企业/个人客户的默认 RPM/TPM 基线。未设例外的客户按此生效，最终受模型全局限流硬顶约束。此配置由「客户管理 → 额度管理」页读取。" />
          </div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>额度管理页生效值 = min(客户例外 ?? 客户类型默认, 模型全局限流硬顶)。</div>
          <div style={{...cfgRow, opacity: rateLimitEnabled ? 1 : 0.5}}>
            <span style={cfgLabel}>企业 RPM 上限</span>
            <input style={cfgInput} type="number" value={enterpriseRpm} onChange={e => setEnterpriseRpm(Number(e.target.value))} disabled={!rateLimitEnabled} />
            <span style={{ fontSize: 12, color: "#888" }}>请求/分钟 · 企业客户默认</span>
          </div>
          <div style={{...cfgRow, opacity: rateLimitEnabled ? 1 : 0.5}}>
            <span style={cfgLabel}>企业 TPM 上限</span>
            <input style={cfgInput} type="number" value={enterpriseTpm} onChange={e => setEnterpriseTpm(Number(e.target.value))} disabled={!rateLimitEnabled} />
            <span style={{ fontSize: 12, color: "#888" }}>Token/分钟 · 企业客户默认</span>
          </div>
          <div style={{...cfgRow, opacity: rateLimitEnabled ? 1 : 0.5}}>
            <span style={cfgLabel}>个人 RPM 上限</span>
            <input style={cfgInput} type="number" value={personalRpm} onChange={e => setPersonalRpm(Number(e.target.value))} disabled={!rateLimitEnabled} />
            <span style={{ fontSize: 12, color: "#888" }}>请求/分钟 · 个人客户默认</span>
          </div>
          <div style={{...cfgRow, opacity: rateLimitEnabled ? 1 : 0.5}}>
            <span style={cfgLabel}>个人 TPM 上限</span>
            <input style={cfgInput} type="number" value={personalTpm} onChange={e => setPersonalTpm(Number(e.target.value))} disabled={!rateLimitEnabled} />
            <span style={{ fontSize: 12, color: "#888" }}>Token/分钟 · 个人客户默认</span>
          </div>
          <button onClick={saveRate} style={{ marginTop: 16, padding: "8px 24px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>保存限流设置</button>
        </div>
      )}

      {tab === "security" && (
        <div style={cfgSection}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>🛡️ 安全策略 <HelpIcon text="配置会话超时、登录限次、MFA强制、IP白名单等安全策略。" /></h3>
          <div style={cfgRow}><span style={cfgLabel}>会话超时 (分钟) <HelpIcon text="用户登录后无操作超过此时间将自动退出。" /></span><input style={cfgInput} type="number" value={sessionTimeout} onChange={e => setSessionTimeout(Number(e.target.value))} /></div>
          <div style={cfgRow}><span style={cfgLabel}>最大登录尝试次数 <HelpIcon text="连续登录失败超过此次数将被临时锁定。" /></span><input style={cfgInput} type="number" value={maxLoginAttempts} onChange={e => setMaxLoginAttempts(Number(e.target.value))} /></div>
          <div style={cfgRow}><span style={cfgLabel}>强制 MFA <HelpIcon text="开启后所有管理员必须绑定双因素认证。" /></span><Toggle on={mfaRequired} onChange={setMfaRequired} /></div>
          <div style={cfgRow}><span style={cfgLabel}>IP 白名单 <HelpIcon text="开启后仅白名单IP可访问管理后台。" /></span><Toggle on={ipWhitelistEnabled} onChange={setIpWhitelistEnabled} /></div>
          <div style={cfgRow}>
            <span style={cfgLabel}>白名单 IP 列表</span>
            <textarea style={{ ...cfgInput, width: 300, height: 60 }} value={ipWhitelist} onChange={e => setIpWhitelist(e.target.value)} placeholder="一行一个IP，如 10.0.0.1" disabled={!ipWhitelistEnabled} />
          </div>
          <button onClick={saveSecurity} style={{ marginTop: 16, padding: "8px 24px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>保存安全配置</button>
        </div>
      )}

      {tab === "feature" && (
        <div style={cfgSection}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>🔧 功能开关 <HelpIcon text="控制平台核心功能的开关，关闭后用户将看不到对应入口。紧急情况下可快速关闭高风险功能。" /></h3>
          <div style={cfgRow}><span style={cfgLabel}>开放注册 <HelpIcon text="关闭后新用户将无法注册。" /></span><Toggle on={registrationOpen} onChange={setRegistrationOpen} /><span style={{ fontSize: 12, color: registrationOpen ? "#22c55e" : "#e53935" }}>{registrationOpen ? "✅ 开放" : "⛔ 关闭"}</span></div>
          <div style={cfgRow}><span style={cfgLabel}>充值功能 <HelpIcon text="关闭后用户无法充值。" /></span><Toggle on={rechargeEnabled} onChange={setRechargeEnabled} /><span style={{ fontSize: 12, color: rechargeEnabled ? "#22c55e" : "#e53935" }}>{rechargeEnabled ? "✅ 启用" : "⛔ 关闭"}</span></div>
          <div style={cfgRow}><span style={cfgLabel}>提现功能 <HelpIcon text="关闭后代理商无法发起提现。" /></span><Toggle on={withdrawEnabled} onChange={setWithdrawEnabled} /><span style={{ fontSize: 12, color: withdrawEnabled ? "#22c55e" : "#e53935" }}>{withdrawEnabled ? "✅ 启用" : "⛔ 关闭"}</span></div>
          <button onClick={saveFeature} style={{ marginTop: 16, padding: "8px 24px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>保存功能开关</button>
        </div>
      )}

      {tab === "api" && (
        <div style={cfgSection}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>🔌 对外 API 服务 <HelpIcon text="配置对外 API 网关域名（独立域名 api.&lt;host&gt;，对齐 DeepSeek 用法）。同域同时暴露 OpenAI 与 Anthropic 两套 SDK 兼容 base_url；保存后门户首页与用户接入引导实时生效。值可为域名（api.unmisa.com）或完整地址（http://localhost:3000）。" /></h3>
          <div style={cfgRow}>
            <span style={cfgLabel}>API 域名 <HelpIcon text="对外 API 网关域名。OpenAI base_url = https://&lt;此域名&gt;，Anthropic base_url = https://&lt;此域名&gt;/anthropic。" /></span>
            <input style={{...cfgInput, width: 320}} value={apiDomain} onChange={e => setApiDomain(e.target.value)} placeholder="api.unmisa.com" />
          </div>
          <div style={{ margin: "16px 0 6px", fontSize: 13, fontWeight: 600, color: "#333" }}>
            📡 对外接入地址（实时派生预览）<HelpIcon text="保存后用户侧接入引导将展示以下地址。" />
          </div>
          <div style={{ background: "#1e293b", borderRadius: 8, padding: 14, fontFamily: "monospace", fontSize: 12, color: "#e2e8f0", lineHeight: 1.9 }}>
            <div>OpenAI base_url（SDK）&nbsp;&nbsp;: <span style={{ color: "#34d399" }}>{apiOrigin}/v1</span></div>
            <div>Anthropic base_url（SDK）: <span style={{ color: "#34d399" }}>{apiOrigin}/anthropic</span></div>
            <div>OpenAI 聊天端点&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: <span style={{ color: "#fbbf24" }}>{apiOrigin}/v1/chat/completions</span></div>
            <div>Anthropic 消息端点&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: <span style={{ color: "#fbbf24" }}>{apiOrigin}/anthropic/v1/messages</span></div>
          </div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 10 }}>
            💡 生产环境：确认 DNS（api.&lt;host&gt; → 服务器）与 nginx vhost（deploy/api.unmisa.com.conf）已配置，并签发对应 SSL 证书。
          </div>
          <button onClick={saveApi} style={{ marginTop: 16, padding: "8px 24px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>保存 API 域名</button>
        </div>
      )}
    </div>
  );
}

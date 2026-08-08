import { useState, useEffect, useCallback } from "react";
import HelpModal from "../../components/HelpModal";
import StatusBadge from "../../components/StatusBadge";
import { apiGet, apiPut } from "../../services/api";

// ── API types ──

interface SiteConfig {
  key: string;
  value: string;
}

interface RoleItem {
  id: number;
  name: string;
  label: string;
  description: string;
  permissions: number;
  is_system: boolean;
  user_count: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

type SettingsTab = "site" | "email" | "roles";

/**
 * Email templates — currently no backend endpoint; kept as mock.
 * TODO: 后端需补充 GET/POST/PUT /api/v1/admin/email-templates 端点
 */
const MOCK_TEMPLATES = [
  { id: 1, name: "注册验证码", subject: "【3Cloud】您的注册验证码", lastModified: "2025-07-15", status: "active" },
  { id: 2, name: "充值成功通知", subject: "【3Cloud】充值到账通知", lastModified: "2025-07-20", status: "active" },
  { id: 3, name: "余额预警", subject: "【3Cloud】余额不足提醒", lastModified: "2025-08-01", status: "active" },
  { id: 4, name: "工单回复通知", subject: "【3Cloud】工单 {ticketNo} 有新回复", lastModified: "2025-06-10", status: "active" },
  { id: 5, name: "账户冻结通知", subject: "【3Cloud】账户状态变更通知", lastModified: "2025-05-25", status: "inactive" },
];

export default function AdminSettings() {
  const [tab, setTab] = useState<SettingsTab>("site");

  // ── Site config state ──
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // ── Roles state ──
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // ── Form fields (for site tab) ──
  const [siteName, setSiteName] = useState("");
  const [siteDesc, setSiteDesc] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [maxKeys, setMaxKeys] = useState("10");

  // ── Fetch site configs ──
  const fetchConfigs = useCallback(async () => {
    setConfigLoading(true);
    try {
      const data = await apiGet<SiteConfig[]>("/admin/site-config");
      const map: Record<string, string> = {};
      for (const c of data ?? []) {
        map[c.key] = c.value;
      }
      setConfigs(map);
      // Populate form fields
      setSiteName(map.site_name ?? "3Cloud AI Token 聚合平台");
      setSiteDesc(map.site_description ?? "一站式 AI 模型接入与 Token 管理平台");
      setContactEmail(map.site_contact_email ?? "support@3cloud.ai");
      setMaxKeys(map.site_max_api_keys ?? "10");
    } catch {
      // Use defaults
    } finally {
      setConfigLoading(false);
    }
  }, []);

  // ── Fetch roles ──
  const fetchRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const data = await apiGet<{ list: RoleItem[] }>("/admin/roles");
      setRoles(data.list ?? []);
    } catch {
      // non-critical
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
    fetchRoles();
  }, [fetchConfigs, fetchRoles]);

  // ── Save site config ──
  const handleSaveConfig = async () => {
    setConfigSaving(true);
    setConfigSaved(false);
    try {
      await apiPut("/admin/site-config", {
        site_name: siteName,
        site_description: siteDesc,
        site_contact_email: contactEmail,
        site_max_api_keys: maxKeys,
      });
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (e: any) {
      alert(e.message ?? "保存失败");
    } finally {
      setConfigSaving(false);
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <h2 className="admin-page-title">
          系统设置
          <HelpModal title="系统设置">
            <p>管理系统全局配置，包括站点基础信息、邮件模板和角色权限。</p>
            <p><strong>站点配置</strong>：GET/PUT /api/v1/admin/site-config — 站点名称、描述、联系邮箱等。</p>
            <p><strong>角色权限</strong>：GET /api/v1/admin/roles — 管理后台的不同角色及其权限范围。</p>
            <p><strong>邮件模板</strong>：TODO — 需后端补充端点，当前为演示数据。</p>
          </HelpModal>
        </h2>
      </div>

      {/* Settings tabs */}
      <div className="panel">
        <div className="panel-header">
          <div className="filter-tabs">
            <button className={`filter-tab${tab === "site" ? " active" : ""}`} onClick={() => setTab("site")}>🌐 站点配置</button>
            <button className={`filter-tab${tab === "email" ? " active" : ""}`} onClick={() => setTab("email")}>📧 邮件模板</button>
            <button className={`filter-tab${tab === "roles" ? " active" : ""}`} onClick={() => setTab("roles")}>🛡️ 角色权限</button>
          </div>
        </div>

        <div className="panel-body">
          {tab === "site" && (
            <div style={{ maxWidth: 600 }}>
              {configLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#888" }}>⏳ 加载中…</div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
                    GET /api/v1/admin/site-config ({Object.keys(configs).length} 条配置)
                  </div>
                  <div className="form-group">
                    <label className="form-label">站点名称</label>
                    <input className="form-input" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">站点描述</label>
                    <textarea className="form-textarea" value={siteDesc} onChange={(e) => setSiteDesc(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">联系邮箱</label>
                    <input className="form-input" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">每用户 API Key 上限</label>
                    <input
                      className="form-input"
                      type="number"
                      value={maxKeys}
                      onChange={(e) => setMaxKeys(e.target.value)}
                      style={{ width: 120 }}
                    />
                  </div>
                  <div className="flex-wrap gap-8" style={{ alignItems: "center" }}>
                    <button className="btn btn-primary" onClick={handleSaveConfig} disabled={configSaving}>
                      {configSaving ? "保存中…" : "💾 保存配置"}
                    </button>
                    {configSaved && <span style={{ color: "#22c55e", fontSize: 13 }}>✅ 已保存 (PUT /api/v1/admin/site-config)</span>}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "email" && (
            <div>
              <div style={{ fontSize: 12, color: "#f59e0b", marginBottom: 12 }}>
                ⚠️ TODO: 后端需补充 GET/POST/PUT /api/v1/admin/email-templates 端点，当前为演示数据
              </div>
              <table className="data-table">
                <thead>
                  <tr><th>ID</th><th>模板名称</th><th>邮件主题</th><th>最后修改</th><th>状态</th></tr>
                </thead>
                <tbody>
                  {MOCK_TEMPLATES.map((t) => (
                    <tr key={t.id}>
                      <td>{t.id}</td>
                      <td>{t.name}</td>
                      <td className="text-mono">{t.subject}</td>
                      <td>{t.lastModified}</td>
                      <td>
                        <StatusBadge status={t.status === "active" ? "success" : "warning"}>
                          {t.status === "active" ? "启用" : "停用"}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "roles" && (
            <div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
                GET /api/v1/admin/roles ({roles.length} 个角色)
              </div>
              {rolesLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#888" }}>⏳ 加载中…</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr><th>ID</th><th>角色名称</th><th>标签</th><th>描述</th><th>用户数</th><th>系统</th><th>排序</th></tr>
                  </thead>
                  <tbody>
                    {roles.length > 0 ? roles.map((r) => (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td><strong>{r.label}</strong><br /><span className="text-mono" style={{ fontSize: 11 }}>{r.name}</span></td>
                        <td>{r.label}</td>
                        <td>{r.description || "—"}</td>
                        <td>{r.user_count} 人</td>
                        <td>{r.is_system ? "🔒 系统" : "自定义"}</td>
                        <td>{r.sort_order}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "#888" }}>暂无角色数据（可调用 POST /api/v1/admin/roles/seed 初始化）</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import { apiGet, apiPost } from "../../services/api";

// ── Types ──
interface RiskRule {
  id: string;
  name: string;
  type: "rate_limit" | "abuse" | "fraud" | "content_filter";
  description: string;
  severity: "high" | "medium" | "low";
  action: "block" | "review" | "warn" | "throttle";
  trigger_count?: number;
  triggerCount?: number;
  enabled: boolean;
}

interface SecurityEvent {
  id: string;
  type: string;
  level: "critical" | "high" | "medium" | "low";
  source: string;
  detail: string;
  ip: string;
  timestamp: string;
  handled: boolean;
  handled_by?: string;
  handledBy?: string;
}

const LEVEL_MAP: Record<string, { cls: string; label: string }> = {
  critical: { cls: "badge-danger", label: "严重" },
  high: { cls: "badge-danger", label: "高危" },
  medium: { cls: "badge-warning", label: "中危" },
  low: { cls: "badge-info", label: "低危" },
};

const ACTION_MAP: Record<string, { cls: string; label: string }> = {
  block: { cls: "badge-danger", label: "拦截" },
  review: { cls: "badge-warning", label: "审核" },
  warn: { cls: "badge-info", label: "告警" },
  throttle: { cls: "badge-info", label: "限流" },
};

// ── Component ──
export default function AdminRisk() {
  const [rules, setRules] = useState<RiskRule[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"rules" | "ips" | "events">("rules");
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [rulesRes, eventsRes] = await Promise.all([
        apiGet<RiskRule[]>("/admin/security/rules"),
        apiGet<SecurityEvent[]>("/admin/security/events"),
      ]);
      setRules(Array.isArray(rulesRes) ? rulesRes : []);
      setEvents(Array.isArray(eventsRes) ? eventsRes : []);
    } catch (e: any) {
      setLoadError(e.message || "加载风控数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleRule = async (id: string) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
    try {
      await apiPost(`/admin/security/rules`, { id, enabled: !rule.enabled });
      showToast("规则状态已更新");
    } catch {
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: rule.enabled } : r)));
    }
  };

  const handleEvent = async (id: string) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, handled: true, handledBy: "admin", handled_by: "admin" } : e)));
    try {
      await apiPost(`/admin/security/events/${id}/handle`);
      showToast("事件已处理");
    } catch {
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, handled: false } : e)));
    }
  };

  const formatTriggerCount = (r: RiskRule) => r.trigger_count ?? r.triggerCount ?? 0;
  const formatEventHandledBy = (e: SecurityEvent) => e.handledBy || e.handled_by;

  return (
    <AdminLayout>
      <h1 className="page-title">
        风控管理
        <HelpModal title="风控管理">
          <p>管理平台安全风险控制：风控规则、IP 黑白名单、安全事件处理。</p>
          <p style={{ marginTop: 8 }}>🛡️ 三大模块：</p>
          <ul style={{ paddingLeft: 20, marginTop: 4 }}>
            <li><strong>风控规则</strong>：限流、滥用检测、欺诈检测、内容过滤规则</li>
            <li><strong>IP 黑/白名单</strong>：管理员手动管理，列入黑名单的 IP 将被拒绝访问</li>
            <li><strong>安全事件</strong>：查看和处理所有安全告警事件</li>
          </ul>
        </HelpModal>
      </h1>
      <p className="page-subtitle">管理风控规则、IP 黑白名单和安全事件</p>

      {loadError && (
        <div style={{ padding: "8px 12px", marginBottom: 12, background: "var(--color-warning-bg)", borderRadius: 6, fontSize: 13, color: "var(--color-warning-text)" }}>
          ⚠️ {loadError}
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        {[
          { l: "启用规则", v: `${rules.filter((r) => r.enabled).length}/${rules.length}` },
          { l: "未处理事件", v: String(events.filter((e) => !e.handled).length) },
          { l: "高危事件", v: String(events.filter((e) => e.level === "critical" || e.level === "high").length) },
          { l: "已处理事件", v: String(events.filter((e) => e.handled).length) },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor: "default" }}>
            <div className="stat-card-label">{s.l}</div>
            <div className="stat-card-value">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="filter-tabs mb-16">
        {(["rules", "ips", "events"] as const).map((tab) => (
          <button
            key={tab}
            className={`filter-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "rules" ? "风控规则" : tab === "ips" ? "IP 管理" : "安全事件"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
          <div style={{ color: "var(--color-text-secondary)" }}>加载中...</div>
        </div>
      ) : (
      <>
      {activeTab === "rules" && rules.length === 0 && (
        <div className="panel" style={{ padding: 60, textAlign: "center", color: "var(--color-text-secondary)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️</div>
          <div>暂无风控规则配置</div>
        </div>
      )}

      {activeTab === "rules" && rules.length > 0 && (
        <div className="panel">
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>规则名称</th>
                  <th>类型</th>
                  <th>严重等级</th>
                  <th>触发动作</th>
                  <th>触发阈值</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.5 }}>
                    <td>
                      <div><strong>{r.name}</strong></div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{r.description}</div>
                    </td>
                    <td><span className="badge badge-info">{r.type}</span></td>
                    <td>
                      <span className={`badge ${LEVEL_MAP[r.severity].cls}`}>{LEVEL_MAP[r.severity].label}</span>
                    </td>
                    <td>
                      <span className={`badge ${ACTION_MAP[r.action].cls}`}>{ACTION_MAP[r.action].label}</span>
                    </td>
                    <td>{r.type === "fraud" ? `¥${formatTriggerCount(r)}` : formatTriggerCount(r)}</td>
                    <td>
                      <span className={`badge ${r.enabled ? "badge-success" : "badge-danger"}`}>
                        {r.enabled ? "启用" : "停用"}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-xs btn-secondary" onClick={() => toggleRule(r.id)}>
                        {r.enabled ? "停用" : "启用"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "ips" && (
        <div className="panel">
          <div className="panel-header">
            <span>IP 黑/白名单</span>
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  IP 名单由运维人员通过 API 直接管理
            </span>
          </div>
          <div style={{ padding: 60, textAlign: "center", color: "var(--color-text-secondary)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
            <div>IP 黑/白名单通过 API 端点管理（GET/POST/DELETE /admin/security/ips）</div>
          </div>
        </div>
      )}

      {activeTab === "events" && events.length === 0 && (
        <div className="panel" style={{ padding: 60, textAlign: "center", color: "var(--color-text-secondary)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🚨</div>
          <div>暂无安全事件</div>
        </div>
      )}

      {activeTab === "events" && events.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            🚨 安全事件
            <span className="badge badge-danger">
              {events.filter((e) => !e.handled).length} 未处理
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类型</th>
                  <th>等级</th>
                  <th>来源</th>
                  <th>详情</th>
                  <th>IP</th>
                  <th>处理状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} style={{ background: ev.handled ? undefined : "var(--color-row-hover)" }}>
                    <td style={{ fontSize: 12 }}>{ev.timestamp}</td>
                    <td><span className="badge badge-info">{ev.type}</span></td>
                    <td>
                      <span className={`badge ${LEVEL_MAP[ev.level].cls}`}>{LEVEL_MAP[ev.level].label}</span>
                    </td>
                    <td>{ev.source}</td>
                    <td style={{ fontSize: 12, color: "var(--color-text-secondary)", maxWidth: 300 }}>{ev.detail}</td>
                    <td><span className="text-mono" style={{ fontSize: 12 }}>{ev.ip}</span></td>
                    <td>
                      {ev.handled ? (
                        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                          ✅ 已处理 ({formatEventHandledBy(ev)})
                        </span>
                      ) : (
                        <span className="badge badge-warning">待处理</span>
                      )}
                    </td>
                    <td>
                      {!ev.handled && (
                        <button className="btn btn-xs btn-primary" onClick={() => handleEvent(ev.id)}>
                          处理
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </AdminLayout>
  );
}

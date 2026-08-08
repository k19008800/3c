import { useState, useEffect } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import { apiGet, apiPut } from "../../services/api";

// ── Types ──
interface CircuitBreakerRule {
  id: string;
  name: string;
  metric: "cpu" | "memory" | "error_rate" | "latency";
  threshold: number;
  unit: string;
  duration: number;
  cooldown: number;
  action: "degrade" | "failover" | "alert";
  enabled: boolean;
}

interface RouteOverride {
  id: string;
  model: string;
  originalProvider: string;
  targetProvider: string;
  targetModel: string;
  reason: string;
  priority: number;
  enabled: boolean;
}

interface SiteConfigItem {
  key: string;
  value: string;
}

// ── Mock Data (for sections without live API) ──
const MOCK_CIRCUIT_BREAKERS: CircuitBreakerRule[] = [
  { id: "1", name: "OpenAI CPU 过载保护", metric: "cpu", threshold: 85, unit: "%", duration: 30, cooldown: 120, action: "degrade", enabled: true },
  { id: "2", name: "内存使用率保护", metric: "memory", threshold: 90, unit: "%", duration: 10, cooldown: 60, action: "failover", enabled: true },
  { id: "3", name: "API 错误率熔断", metric: "error_rate", threshold: 5, unit: "%", duration: 60, cooldown: 300, action: "degrade", enabled: true },
  { id: "4", name: "延迟超限熔断", metric: "latency", threshold: 3000, unit: "ms", duration: 20, cooldown: 180, action: "alert", enabled: false },
];

const MOCK_ROUTES: RouteOverride[] = [
  { id: "1", model: "GPT-4o", originalProvider: "OpenAI", targetProvider: "Azure OpenAI", targetModel: "gpt-4o-azure", reason: "OpenAI 配额已满，切换到 Azure 实例", priority: 1, enabled: true },
  { id: "2", model: "Claude 3.5 Sonnet", originalProvider: "Anthropic", targetProvider: "AWS Bedrock", targetModel: "claude-3-5-sonnet-v2", reason: "Anthropic 直接 API 延迟过高", priority: 2, enabled: true },
  { id: "3", model: "Gemini 2.0 Flash", originalProvider: "Google", targetProvider: "Vertex AI", targetModel: "gemini-2.0-flash-vertex", reason: "区域负载均衡优化", priority: 3, enabled: false },
];

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  degrade: { label: "降级", cls: "badge-warning" },
  failover: { label: "故障转移", cls: "badge-info" },
  alert: { label: "告警", cls: "badge-danger" },
};

const METRIC_LABELS: Record<string, string> = {
  cpu: "CPU 使用率",
  memory: "内存使用率",
  error_rate: "错误率",
  latency: "响应延迟",
};

// ── Component ──
export default function AdminOps() {
  const [siteConfigs, setSiteConfigs] = useState<SiteConfigItem[]>([]);
  const [circuitBreakers, setCircuitBreakers] = useState<CircuitBreakerRule[]>(MOCK_CIRCUIT_BREAKERS);
  const [routes, setRoutes] = useState<RouteOverride[]>(MOCK_ROUTES);
  const [activeTab, setActiveTab] = useState<"circuit" | "route" | "switch">("circuit");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Load site configs from API
  const loadConfigs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<SiteConfigItem[]>("/admin/site-config");
      setSiteConfigs(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || "加载配置失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  // Build switch UI from site configs
  const switches = siteConfigs.map((item) => ({
    id: item.key,
    name: item.key.replace(/^site_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: `配置项: ${item.key}`,
    key: item.key,
    enabled: item.value === "true" || item.value === "1",
  }));

  const toggleCircuitBreaker = (id: string) => {
    setCircuitBreakers((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const toggleRoute = (id: string) => {
    setRoutes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const toggleSwitch = async (key: string, currentEnabled: boolean) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      // Update via site-config API
      await apiPut("/admin/site-config", {
        [key]: currentEnabled ? "false" : "true",
      });
      setSiteConfigs((prev) =>
        prev.map((s) =>
          s.key === key ? { ...s, value: currentEnabled ? "false" : "true" } : s
        )
      );
      setSaveMsg("✅ 已保存");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e: any) {
      setSaveMsg(`❌ ${e.message || "保存失败"}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
          <span className="loading-spinner" /> 加载中…
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="panel" style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <div style={{ color: "var(--color-danger)" }}>{error}</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={loadConfigs}>
            重试
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h1 className="page-title">
        运维配置
        <HelpModal title="运维配置">
          <p>管理系统运维相关配置：熔断规则、路由覆盖和全局功能开关。</p>
          <p style={{ marginTop: 8 }}>🔧 三大配置模块：</p>
          <ul style={{ paddingLeft: 20, marginTop: 4 }}>
            <li><strong>熔断配置</strong>：CPU/内存/错误率/延迟阈值，触发后自动降级或故障转移</li>
            <li><strong>路由覆盖规则</strong>：将请求从原始供应商重定向到备用供应商</li>
            <li><strong>全局开关</strong>：控制注册、API 访问、支付渠道等全局功能（从 site_configs 表加载）</li>
          </ul>
        </HelpModal>
      </h1>
      <p className="page-subtitle">管理熔断规则、路由覆盖和全局开关</p>

      {/* Tabs */}
      <div className="filter-tabs mb-16">
        {(["circuit", "route", "switch"] as const).map((tab) => (
          <button
            key={tab}
            className={`filter-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "circuit" ? "熔断配置" : tab === "route" ? "路由覆盖" : "全局开关"}
          </button>
        ))}
      </div>

      {/* Circuit Breakers — TODO: migrate to GET/PUT /monitoring/rules */}
      {activeTab === "circuit" && (
        <>
          <div
            style={{
              padding: "6px 12px",
              marginBottom: 12,
              borderRadius: "var(--radius-md)",
              background: "var(--color-warning-bg)",
              fontSize: 12,
              color: "var(--color-text-secondary)",
            }}
          >
            {/* TODO: 集成 GET /monitoring/rules 和 PUT /monitoring/rules/:id */}
            ⚠️ 熔断规则当前使用演示数据。TODO: 集成 GET/PUT /api/v1/monitoring/rules
          </div>
          <div className="panel">
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>规则名称</th>
                    <th>监控指标</th>
                    <th>阈值</th>
                    <th>持续时长(s)</th>
                    <th>冷却时长(s)</th>
                    <th>触发动作</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {circuitBreakers.map((cb) => (
                    <tr key={cb.id} style={{ opacity: cb.enabled ? 1 : 0.5 }}>
                      <td><strong>{cb.name}</strong></td>
                      <td>{METRIC_LABELS[cb.metric]}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: cb.threshold >= 80 ? "var(--color-danger)" : undefined }}>
                          {cb.threshold}{cb.unit}
                        </span>
                      </td>
                      <td>{cb.duration}</td>
                      <td>{cb.cooldown}</td>
                      <td>
                        <span className={`badge ${ACTION_LABELS[cb.action].cls}`}>
                          {ACTION_LABELS[cb.action].label}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${cb.enabled ? "badge-success" : "badge-danger"}`}>
                          {cb.enabled ? "启用" : "停用"}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-xs btn-secondary" onClick={() => toggleCircuitBreaker(cb.id)}>
                          {cb.enabled ? "停用" : "启用"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Route Overrides — TODO: needs route management endpoints */}
      {activeTab === "route" && (
        <>
          <div
            style={{
              padding: "6px 12px",
              marginBottom: 12,
              borderRadius: "var(--radius-md)",
              background: "var(--color-warning-bg)",
              fontSize: 12,
              color: "var(--color-text-secondary)",
            }}
          >
            {/* TODO: 路由覆盖规则需要后端路由管理 API */}
            ⚠️ 路由覆盖当前使用演示数据。TODO: 需后端路由管理 API
          </div>
          <div className="panel">
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>模型</th>
                    <th>原始供应商</th>
                    <th>目标供应商</th>
                    <th>目标模型</th>
                    <th>原因</th>
                    <th>优先级</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => (
                    <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.5 }}>
                      <td><strong>{r.model}</strong></td>
                      <td>{r.originalProvider}</td>
                      <td><span style={{ color: "var(--color-primary)" }}>→ {r.targetProvider}</span></td>
                      <td><span className="text-mono" style={{ fontSize: 12 }}>{r.targetModel}</span></td>
                      <td style={{ fontSize: 12, color: "var(--color-text-secondary)", maxWidth: 250 }}>
                        {r.reason}
                      </td>
                      <td>{r.priority}</td>
                      <td>
                        <span className={`badge ${r.enabled ? "badge-success" : "badge-danger"}`}>
                          {r.enabled ? "生效中" : "已停用"}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-xs btn-secondary" onClick={() => toggleRoute(r.id)}>
                          {r.enabled ? "停用" : "启用"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Global Switches — live from site_configs API */}
      {activeTab === "switch" && (
        <>
          {saveMsg && (
            <div
              style={{
                padding: "8px 12px",
                marginBottom: 12,
                borderRadius: "var(--radius-md)",
                background: saveMsg.startsWith("✅") ? "var(--color-success-bg)" : "var(--color-danger-bg)",
                color: saveMsg.startsWith("✅") ? "var(--color-success-text)" : "var(--color-danger-text)",
                fontSize: 13,
              }}
            >
              {saveMsg}
            </div>
          )}
          {switches.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔧</div>
              <div style={{ color: "var(--color-text-secondary)" }}>
                暂无全局开关配置（site_configs 表为空）
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {switches.map((sw) => (
                <div key={sw.id} className="panel">
                  <div className="panel-body">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{sw.name}</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                          {sw.description}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
                          KEY: {sw.key}
                        </div>
                      </div>
                      <button
                        className={`btn ${sw.enabled ? "btn-primary" : "btn-secondary"}`}
                        style={{
                          minWidth: 80,
                          background: sw.enabled ? undefined : "var(--color-disabled-bg)",
                          color: sw.enabled ? undefined : "var(--color-text-secondary)",
                        }}
                        onClick={() => toggleSwitch(sw.key, sw.enabled)}
                        disabled={saving}
                      >
                        {sw.enabled ? "🟢 已开启" : "⚪ 已关闭"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}

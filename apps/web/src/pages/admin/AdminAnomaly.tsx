import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import { api } from "../../services/api";

// ── Types ──
interface MonitoringAlert {
  id: string;
  type: string;
  name: string;
  message: string;
  severity: "critical" | "warning" | "info";
  acknowledged: boolean;
  resolved: boolean;
  acknowledged_at: string | null;
  resolved_at: string | null;
  timestamp: string;
  context: any;
}

interface MonitoringRule {
  id: string;
  type: string;
  name: string;
  description: string;
  threshold: number;
  severity: string;
  enabled: boolean;
  duration: number;
  silencePeriod: number;
}

const STATUS_MAP: Record<string, string> = {
  all: "全部",
};

const levelLabel: Record<string, string> = { low: "低", medium: "中", high: "高", critical: "严重", warning: "警告", info: "信息" };

export default function AdminAnomaly() {
  const [tab, setTab] = useState<"anomalies" | "rules">("anomalies");

  // Alerts state
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([]);
  const [alertLoading, setAlertLoading] = useState(true);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [alertTotal, setAlertTotal] = useState(0);
  const [severityFilter, setSeverityFilter] = useState("全部");
  const [page, setPage] = useState(1);
  const [detailModal, setDetailModal] = useState<MonitoringAlert | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Rules state
  const [rules, setRules] = useState<MonitoringRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const pageSize = 15;

  const fetchAlerts = useCallback(async () => {
    setAlertLoading(true);
    setAlertError(null);
    try {
      const params: Record<string, string | number> = { page, pageSize };
      if (severityFilter !== "全部") params.severity = severityFilter;
      const res = await api.get<any>("/monitoring/alerts", params);
      setAlerts(res.list);
      setAlertTotal(res.total);
    } catch (e: any) {
      setAlertError(e.message ?? "加载失败");
    } finally {
      setAlertLoading(false);
    }
  }, [page, severityFilter]);

  const fetchRules = useCallback(async () => {
    setRulesLoading(true);
    setRulesError(null);
    try {
      const res = await api.get<any>("/monitoring/rules");
      setRules(res.list);
    } catch (e: any) {
      setRulesError(e.message ?? "加载失败");
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "anomalies") fetchAlerts();
  }, [tab, fetchAlerts]);

  useEffect(() => {
    if (tab === "rules") fetchRules();
  }, [tab, fetchRules]);

  const handleAcknowledge = async (alertId: string) => {
    setActionLoading(true);
    try {
      await api.post(`/monitoring/alerts/${alertId}/acknowledge`);
      fetchAlerts();
    } catch (e: any) {
      alert(e.message ?? "操作失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async (alertId: string) => {
    setActionLoading(true);
    try {
      await api.post(`/monitoring/alerts/${alertId}/resolve`);
      setDetailModal(null);
      fetchAlerts();
    } catch (e: any) {
      alert(e.message ?? "操作失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleRule = async (rule: MonitoringRule) => {
    try {
      await api.put(`/monitoring/rules/${rule.id}`, { enabled: !rule.enabled });
      fetchRules();
    } catch (e: any) {
      alert(e.message ?? "操作失败");
    }
  };

  const totalPages = Math.max(1, Math.ceil(alertTotal / pageSize));
  const safePage = Math.min(page, totalPages);

  const pendingCount = alerts.filter((a) => !a.acknowledged && !a.resolved).length;
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const resolvedCount = alerts.filter((a) => a.resolved).length;

  return (
    <AdminLayout>
      <h1 className="page-title">
        消费异常监控
        <HelpModal title="消费异常监控">
          <p>监控平台用户的异常消费行为，及时发现和处理消费异常。</p>
          <p style={{ marginTop: 8 }}>配置告警规则后，系统将自动检测异常并生成告警记录。支持多个严重等级。</p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">监控消费异常，配置告警规则</p>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { l: "告警总数", v: String(alertTotal) },
          { l: "待处理", v: String(pendingCount) },
          { l: "严重告警", v: String(criticalCount) },
          { l: "已解决", v: String(resolvedCount) },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor: "default" }}>
            <div className="stat-card-label">{s.l}</div>
            <div className="stat-card-value">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Tab Controls */}
      <div className="flex-wrap mb-16">
        <div className="filter-tabs">
          <button className={`filter-tab ${tab === "anomalies" ? "active" : ""}`} onClick={() => setTab("anomalies")}>
            异常记录
          </button>
          <button className={`filter-tab ${tab === "rules" ? "active" : ""}`} onClick={() => setTab("rules")}>
            告警规则
          </button>
        </div>
      </div>

      {tab === "anomalies" ? (
        <div className="panel">
          <div className="panel-header">
            <span>异常记录</span>
            <div className="flex-wrap">
              <select className="form-select" style={{ width: 110 }} value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}>
                <option value="全部">全部等级</option>
                <option value="critical">严重</option>
                <option value="warning">警告</option>
                <option value="info">信息</option>
              </select>
            </div>
          </div>

          {alertLoading && <div className="panel-body"><div className="loading-spinner" /> 加载中...</div>}
          {alertError && <div className="panel-body"><div className="alert alert-danger">{alertError} <button className="btn btn-xs btn-secondary" onClick={fetchAlerts}>重试</button></div></div>}

          {!alertLoading && !alertError && (
            <>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>类型</th>
                      <th>名称</th>
                      <th>等级</th>
                      <th>消息</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>暂无异常记录</td></tr>
                    ) : (
                      alerts.map((r) => (
                        <tr key={r.id}>
                          <td style={{ fontSize: 12 }}>{r.timestamp ? new Date(r.timestamp).toLocaleString("zh-CN") : "-"}</td>
                          <td><span className="badge badge-info">{r.type}</span></td>
                          <td>{r.name}</td>
                          <td>
                            <StatusBadge status={r.severity === "critical" ? "error" : r.severity === "warning" ? "warning" : "info"}>
                              {levelLabel[r.severity] ?? r.severity}
                            </StatusBadge>
                          </td>
                          <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.message}</td>
                          <td>
                            <StatusBadge status={r.resolved ? "success" : r.acknowledged ? "info" : "pending"}>
                              {r.resolved ? "已解决" : r.acknowledged ? "已确认" : "待处理"}
                            </StatusBadge>
                          </td>
                          <td>
                            <div className="flex-wrap">
                              <button className="btn btn-xs btn-secondary" onClick={() => setDetailModal(r)}>详情</button>
                              {!r.acknowledged && !r.resolved && (
                                <button className="btn btn-xs btn-primary" disabled={actionLoading} onClick={() => handleAcknowledge(r.id)} data-hint="确认告警">确认</button>
                              )}
                              {r.acknowledged && !r.resolved && (
                                <button className="btn btn-xs btn-primary" disabled={actionLoading} onClick={() => handleResolve(r.id)} data-hint="标记已解决">解决</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="panel-body">
                <div className="flex-between">
                  <span className="text-sm text-muted">共 {alertTotal} 条</span>
                  <div className="flex-wrap">
                    <button className="btn btn-sm btn-secondary" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const p = safePage <= 3 ? i + 1 : safePage >= totalPages - 2 ? totalPages - 4 + i : safePage - 2 + i;
                      return p >= 1 && p <= totalPages ? (
                        <button key={p} className={`btn btn-sm ${p === safePage ? "btn-primary" : "btn-secondary"}`} style={p === safePage ? undefined : { padding: "6px 12px" }} onClick={() => setPage(p)}>{p}</button>
                      ) : null;
                    })}
                    <button className="btn btn-sm btn-secondary" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="panel">
          <div className="panel-header">
            <span>告警规则配置</span>
          </div>
          {rulesLoading && <div className="panel-body"><div className="loading-spinner" /> 加载中...</div>}
          {rulesError && <div className="panel-body"><div className="alert alert-danger">{rulesError} <button className="btn btn-xs btn-secondary" onClick={fetchRules}>重试</button></div></div>}
          {!rulesLoading && !rulesError && (
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr><th>规则名称</th><th>监控指标</th><th>阈值</th><th>严重度</th><th>静默期(s)</th><th>状态</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {rules.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>暂无规则</td></tr>
                  ) : (
                    rules.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>{r.type}</td>
                        <td className="text-mono">{r.threshold}</td>
                        <td>
                          <StatusBadge status={r.severity === "critical" ? "error" : r.severity === "warning" ? "warning" : "info"}>
                            {levelLabel[r.severity] ?? r.severity}
                          </StatusBadge>
                        </td>
                        <td>{r.silencePeriod}</td>
                        <td>
                          <StatusBadge status={r.enabled ? "active" : "inactive"}>
                            {r.enabled ? "启用" : "停用"}
                          </StatusBadge>
                        </td>
                        <td>
                          <div className="flex-wrap">
                            <button className="btn btn-xs btn-secondary" onClick={() => handleToggleRule(r)} disabled={actionLoading}>
                              {r.enabled ? "停用" : "启用"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title="告警详情" width={560}>
        {detailModal && (
          <>
            <table className="data-table">
              <tbody>
                <tr><td>时间</td><td>{detailModal.timestamp ? new Date(detailModal.timestamp).toLocaleString("zh-CN") : "-"}</td></tr>
                <tr><td>类型</td><td>{detailModal.type}</td></tr>
                <tr><td>名称</td><td>{detailModal.name}</td></tr>
                <tr><td>等级</td><td><StatusBadge status={detailModal.severity === "critical" ? "error" : "warning"}>{levelLabel[detailModal.severity] ?? detailModal.severity}</StatusBadge></td></tr>
                <tr><td>消息</td><td>{detailModal.message}</td></tr>
                <tr><td>状态</td><td><StatusBadge status={detailModal.resolved ? "success" : detailModal.acknowledged ? "info" : "pending"}>{detailModal.resolved ? "已解决" : detailModal.acknowledged ? "已确认" : "待处理"}</StatusBadge></td></tr>
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              {!detailModal.acknowledged && !detailModal.resolved && (
                <button className="btn btn-primary btn-sm" disabled={actionLoading} onClick={() => { handleAcknowledge(detailModal.id); setDetailModal(null); }}>确认告警</button>
              )}
              {!detailModal.resolved && (
                <button className="btn btn-primary btn-sm" disabled={actionLoading} onClick={() => handleResolve(detailModal.id)}>标记已解决</button>
              )}
            </div>
          </>
        )}
      </Modal>
    </AdminLayout>
  );
}

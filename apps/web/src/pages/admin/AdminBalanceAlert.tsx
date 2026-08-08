import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import { apiGet, apiPost } from "../../services/api";

// ── Types ──
interface AlertRule {
  id: string;
  name: string;
  type: "balance" | "usage" | "expiry";
  threshold: number;
  unit: string;
  notify_channels?: string[];
  notifyChannels?: string[];
  enabled: boolean;
  last_triggered?: string | null;
  lastTriggered?: string | null;
}

interface AlertRecord {
  id: string;
  time: string;
  created_at?: string;
  user: string;
  rule_name?: string;
  ruleName?: string;
  current_value?: number;
  currentValue?: number;
  threshold: number;
  status: "triggered" | "acknowledged" | "resolved";
}

export default function AdminBalanceAlert() {
  const [tab, setTab] = useState<"records" | "rules">("records");
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [records, setRecords] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addRuleOpen, setAddRuleOpen] = useState(false);
  const [newRule, setNewRule] = useState({ name: "", type: "balance" as AlertRule["type"], threshold: 0, unit: "¥" });
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [rulesRes, logsRes] = await Promise.all([
        apiGet<AlertRule[]>("/admin/balance-alerts/rules"),
        apiGet<AlertRecord[]>("/admin/balance-alerts/logs"),
      ]);
      setRules(Array.isArray(rulesRes) ? rulesRes : []);
      setRecords(Array.isArray(logsRes) ? logsRes : []);
    } catch (e: any) {
      setLoadError(e.message || "加载预警数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = records.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleRule = async (id: string) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    // Optimistic update
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
    try {
      await apiPost(`/admin/balance-alerts/rules`, { id, enabled: !rule.enabled });
    } catch {
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: rule.enabled } : r)));
    }
  };

  const createRule = async () => {
    if (!newRule.name.trim()) return;
    try {
      await apiPost("/admin/balance-alerts/rules", newRule);
      setAddRuleOpen(false);
      setNewRule({ name: "", type: "balance", threshold: 0, unit: "¥" });
      fetchAll();
    } catch {}
  };

  const formatNotify = (r: AlertRule) => (r.notify_channels || r.notifyChannels || []).join("、");
  const formatLastTriggered = (r: AlertRule) => r.lastTriggered || r.last_triggered || null;
  const formatRecordRule = (r: AlertRecord) => r.ruleName || r.rule_name || "";
  const formatRecordValue = (r: AlertRecord) => r.currentValue ?? r.current_value ?? 0;
  const formatRecordTime = (r: AlertRecord) => r.time || r.created_at || "";

  return (
    <AdminLayout>
      <h1 className="page-title">
        余额预警
        <HelpModal title="余额预警">
          <p>配置账户余额、消费限额和 API Key 过期预警规则。</p>
          <p style={{ marginTop: 8 }}>
            支持三种预警类型：余额预警、用量预警、过期预警。
            触发预警后可通过站内信、邮件、短信等渠道通知用户。
          </p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">配置预警规则，管理预警记录</p>

      {loadError && (
        <div style={{ padding: "8px 12px", marginBottom: 12, background: "var(--color-warning-bg)", borderRadius: 6, fontSize: 13, color: "var(--color-warning-text)" }}>
          ⚠️ {loadError}
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        {[
          { l: "预警规则", v: `${rules.filter((r) => r.enabled).length}/${rules.length}` },
          { l: "总记录", v: String(records.length) },
          { l: "待确认", v: String(records.filter((r) => r.status === "triggered").length) },
          { l: "已解决", v: String(records.filter((r) => r.status === "resolved").length) },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor: "default" }}>
            <div className="stat-card-label">{s.l}</div>
            <div className="stat-card-value">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="flex-wrap mb-16">
        <div className="filter-tabs">
          <button className={`filter-tab ${tab === "records" ? "active" : ""}`} onClick={() => setTab("records")}>
            预警记录
          </button>
          <button className={`filter-tab ${tab === "rules" ? "active" : ""}`} onClick={() => setTab("rules")}>
            规则配置
          </button>
        </div>
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
          <div style={{ color: "var(--color-text-secondary)" }}>加载中...</div>
        </div>
      ) : (
      <>
      {tab === "records" ? (
        <div className="panel">
          <div className="panel-header">
            <span>预警记录</span>
            <button className="btn btn-sm btn-secondary" onClick={fetchAll}>
              刷新
            </button>
          </div>
          {records.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center", color: "var(--color-text-secondary)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <div>暂无预警记录</div>
            </div>
          ) : (
          <>
          <table className="data-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>触发时间</th>
                <th>用户</th>
                <th>规则</th>
                <th>当前值</th>
                <th>阈值</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.map((r) => (
                <tr key={r.id}>
                  <td className="text-mono" style={{ fontSize: 11 }}>{r.id}</td>
                  <td>{formatRecordTime(r)}</td>
                  <td>{r.user}</td>
                  <td>{formatRecordRule(r)}</td>
                  <td className="text-mono">{formatRecordRule(r).includes("消费") ? `¥${formatRecordValue(r).toLocaleString()}` : formatRecordValue(r)}</td>
                  <td className="text-mono">{formatRecordRule(r).includes("消费") ? `¥${r.threshold.toLocaleString()}` : r.threshold}</td>
                  <td>
                    <StatusBadge status={r.status === "triggered" ? "warning" : r.status === "acknowledged" ? "info" : "success"}>
                      {r.status === "triggered" ? "已触发" : r.status === "acknowledged" ? "已确认" : "已解决"}
                    </StatusBadge>
                  </td>
                  <td>
                    <div className="flex-wrap">
                      {r.status === "triggered" && (
                        <button className="btn btn-xs btn-primary">确认</button>
                      )}
                      <button className="btn btn-xs btn-secondary">详情</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="panel-body">
            <div className="flex-between">
              <span className="text-sm text-muted">共 {records.length} 条</span>
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
            <span>预警规则配置</span>
            <button className="btn btn-sm btn-primary" onClick={() => setAddRuleOpen(true)}>
              + 新建规则
            </button>
          </div>
          {rules.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center", color: "var(--color-text-secondary)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⚙️</div>
              <div>暂无预警规则</div>
            </div>
          ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>规则名称</th>
                <th>类型</th>
                <th>阈值</th>
                <th>通知渠道</th>
                <th>状态</th>
                <th>最后触发</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>
                    <span className={`badge ${r.type === "balance" ? "badge-warning" : r.type === "usage" ? "badge-info" : "badge-success"}`}>
                      {r.type === "balance" ? "余额预警" : r.type === "usage" ? "用量预警" : "过期预警"}
                    </span>
                  </td>
                  <td className="text-mono">{r.threshold} {r.unit}</td>
                  <td>{formatNotify(r) || "—"}</td>
                  <td>
                    <StatusBadge status={r.enabled ? "active" : "inactive"}>
                      {r.enabled ? "启用" : "停用"}
                    </StatusBadge>
                  </td>
                  <td>{formatLastTriggered(r) ?? "-"}</td>
                  <td>
                    <div className="flex-wrap">
                      <button className="btn btn-xs btn-secondary" onClick={() => toggleRule(r.id)}>
                        {r.enabled ? "停用" : "启用"}
                      </button>
                      <button className="btn btn-xs btn-secondary">编辑</button>
                      <button className="btn btn-xs btn-danger">删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      )}
      </>
      )}

      <Modal open={addRuleOpen} onClose={() => setAddRuleOpen(false)} title="新建预警规则">
        <div className="form-group">
          <label className="form-label">规则名称</label>
          <input className="form-input" placeholder="请输入规则名称" value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">预警类型</label>
          <select className="form-select" value={newRule.type} onChange={(e) => setNewRule({ ...newRule, type: e.target.value as AlertRule["type"] })}>
            <option value="balance">余额预警</option>
            <option value="usage">用量预警</option>
            <option value="expiry">过期预警</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">阈值</label>
          <input className="form-input" type="number" placeholder="请输入阈值" value={newRule.threshold} onChange={(e) => setNewRule({ ...newRule, threshold: parseFloat(e.target.value) || 0 })} />
        </div>
        <div className="form-group">
          <label className="form-label">通知渠道</label>
          <div className="flex-wrap">
            {["站内信", "邮件", "短信"].map((ch) => (
              <label key={ch} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                <input type="checkbox" defaultChecked={ch === "站内信"} /> {ch}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={() => setAddRuleOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={createRule} disabled={!newRule.name.trim()}>保存</button>
        </div>
      </Modal>
    </AdminLayout>
  );
}

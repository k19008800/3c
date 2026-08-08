import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import StatusBadge from "../../components/StatusBadge";
import { apiGet } from "../../services/api";

// ── Types ──
type LifecycleStage = "registered" | "activated" | "active" | "dormant" | "churned";

interface Customer {
  id: string;
  name: string;
  email: string;
  stage: LifecycleStage;
  days_since_reg?: number;
  daysSinceReg?: number;
  last_active?: string;
  lastActive?: string;
  total_spent?: number;
  totalSpent?: number;
  models: string[];
}

const STAGES: { key: LifecycleStage; label: string; color: string }[] = [
  { key: "registered", label: "注册", color: "#8b5cf6" },
  { key: "activated", label: "激活", color: "#3b82f6" },
  { key: "active", label: "活跃", color: "#22c55e" },
  { key: "dormant", label: "沉睡", color: "#f59e0b" },
  { key: "churned", label: "流失", color: "#ef4444" },
];

interface FunnelItem { stage: string; count: number; }

export default function AdminCustomerLifecycle() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [funnelData, setFunnelData] = useState<FunnelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<LifecycleStage | "all">("all");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [custRes, funnelRes] = await Promise.all([
        apiGet<Customer[]>("/admin/customers/lifecycle"),
        apiGet<FunnelItem[]>("/admin/customers/lifecycle/funnel"),
      ]);
      setCustomers(Array.isArray(custRes) ? custRes : []);
      setFunnelData(Array.isArray(funnelRes) ? funnelRes : []);
    } catch (e: any) {
      setLoadError(e.message || "加载客户生命周期数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  let filtered = customers;
  if (selectedStage !== "all") filtered = customers.filter((c) => c.stage === selectedStage);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const uniqueModels = [...new Set(filtered.flatMap((c) => c.models || []))];

  // Build funnel from data or customers
  const funnelItems = funnelData.length > 0
    ? funnelData.map((f) => {
        const stageInfo = STAGES.find((s) => s.key === f.stage);
        return { ...stageInfo!, count: f.count, key: f.stage as LifecycleStage };
      })
    : STAGES.map((s) => ({ ...s, count: customers.filter((c) => c.stage === s.key).length }));

  const filteredFunnelItems = funnelItems.filter((f) => f !== undefined) as Array<typeof STAGES[number] & { count: number }>;
  const maxCount = Math.max(...filteredFunnelItems.map((f) => f.count), 1);

  const formatDays = (c: Customer) => c.days_since_reg ?? c.daysSinceReg ?? 0;
  const formatLastActive = (c: Customer) => c.last_active || c.lastActive || "";
  const formatSpent = (c: Customer) => c.total_spent ?? c.totalSpent ?? 0;

  return (
    <AdminLayout>
      <h1 className="page-title">
        客户生命周期
        <HelpModal title="客户生命周期">
          <p>管理客户在各生命周期阶段的分布和转化情况。</p>
          <p style={{ marginTop: 8 }}>
            五个阶段：注册 → 激活 → 活跃 → 沉睡 → 流失。
            通过转化漏斗可视化各阶段客户数量变化，帮助识别客户流失点。
          </p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">客户阶段分布与转化漏斗分析</p>

      {loadError && (
        <div style={{ padding: "8px 12px", marginBottom: 12, background: "var(--color-warning-bg)", borderRadius: 6, fontSize: 13, color: "var(--color-warning-text)" }}>
          ⚠️ {loadError}
        </div>
      )}

      {/* Summary */}
      <div className="stats-grid">
        {[
          { l: "总客户数", v: String(customers.length) },
          { l: "活跃客户", v: String(customers.filter((c) => c.stage === "active").length) },
          { l: "流失率", v: customers.length > 0 ? `${((customers.filter((c) => c.stage === "churned").length / customers.length) * 100).toFixed(1)}%` : "0%" },
          { l: "活跃模型", v: `${uniqueModels.length} 个` },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor: "default" }}>
            <div className="stat-card-label">{s.l}</div>
            <div className="stat-card-value">{s.v}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
          <div style={{ color: "var(--color-text-secondary)" }}>加载中...</div>
        </div>
      ) : (
      <>
      {/* Funnel Chart */}
      <div className="panel mb-16">
        <div className="panel-header">
          <span>📊 转化漏斗</span>
          <span className="text-sm text-muted">
            注册 {customers.filter((c) => c.stage === "registered" || c.stage === "activated" || c.stage === "active" || c.stage === "dormant").length} → 活跃 {customers.filter((c) => c.stage === "active").length}
          </span>
        </div>
        <div className="panel-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 600, margin: "0 auto", padding: "20px 0" }}>
            {filteredFunnelItems.map((f, i) => {
              const pct = maxCount > 0 ? (f.count / maxCount) * 100 : 0;
              const prevCount = i > 0 ? filteredFunnelItems[i - 1]!.count : f.count;
              const conversionRate = i > 0 && prevCount > 0 ? ((f.count / prevCount) * 100).toFixed(1) : "-";
              return (
                <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 80, textAlign: "right", fontSize: 13, fontWeight: 600 }}>{f.label}</div>
                  <div style={{ flex: 1, background: "#f0f2f5", borderRadius: 4, height: 36, position: "relative", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: f.color, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 12, transition: "width 0.5s" }}>
                      <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{f.count} 人</span>
                    </div>
                  </div>
                  <div style={{ width: 72, fontSize: 12, color: "var(--color-text-secondary)", textAlign: "left" }}>
                    {conversionRate !== "-" ? `转化率 ${conversionRate}%` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Customer List */}
      <div className="panel">
        <div className="panel-header">
          <span>客户列表</span>
          <div className="flex-wrap">
            <select className="form-select" style={{ width: 130 }} value={selectedStage} onChange={(e) => { setSelectedStage(e.target.value as LifecycleStage | "all"); setPage(1); }}>
              <option value="all">全部阶段</option>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button className="btn btn-sm btn-secondary" onClick={() => { setSelectedStage("all"); setPage(1); }}>重置</button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--color-text-secondary)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div>暂无客户数据</div>
          </div>
        ) : (
        <>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>客户</th>
                <th>邮箱</th>
                <th>阶段</th>
                <th>注册天数</th>
                <th>最后活跃</th>
                <th>累计消费</th>
                <th>使用模型</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.map((c) => (
                <tr key={c.id} style={c.stage === "churned" ? { opacity: 0.6 } : undefined}>
                  <td className="text-mono" style={{ fontSize: 11 }}>{c.id}</td>
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>
                    <span className="badge" style={{ background: STAGES.find((s) => s.key === c.stage)!.color + "20", color: STAGES.find((s) => s.key === c.stage)!.color }}>
                      {STAGES.find((s) => s.key === c.stage)!.label}
                    </span>
                  </td>
                  <td>{formatDays(c)} 天</td>
                  <td>{formatLastActive(c) || "—"}</td>
                  <td className="text-mono">¥{formatSpent(c).toFixed(2)}</td>
                  <td>{(c.models || []).join("、")}</td>
                  <td>
                    <button className="btn btn-xs btn-secondary">详情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-body">
          <div className="flex-between">
            <span className="text-sm text-muted">共 {filtered.length} 条</span>
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
      </>
      )}
    </AdminLayout>
  );
}

import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import { api } from "../../services/api";

// ── Types ──
interface ReconciliationRecord {
  id: number;
  period: string;
  subject_type: string;
  subject_id: number;
  subject_name: string;
  platform_amount: number;
  counterparty_amount: number;
  diff_amount: number;
  status: string;
  status_label: string;
  created_at: string;
}

interface ApiListResponse {
  list: ReconciliationRecord[];
  pagination: { page: number; page_size: number; total: number };
  stats: { pending_count: number; pending_amount: number };
}

const PERIODS = ["全部", "2026-08", "2026-07", "2026-06", "2026-Q2"];

export default function AdminReconciliation() {
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [pendingStats, setPendingStats] = useState({ count: 0, amount: 0 });

  const [periodFilter, setPeriodFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [diffModal, setDiffModal] = useState<ReconciliationRecord | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const pageSize = 15;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await api.get<ApiListResponse>("/admin/finance/reconciliation/differences", params);
      setRecords(res.list);
      setTotalCount(res.pagination.total);
      setPendingStats({ count: res.stats.pending_count, amount: res.stats.pending_amount });
    } catch (e: any) {
      setError(e.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Client-side period filter (API may not support, fallback)
  let filtered = records;
  if (periodFilter !== "全部") {
    filtered = records.filter((r) => r.period && r.period.startsWith(periodFilter));
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const totalDiff = filtered.reduce((a, b) => a + Math.abs(b.diff_amount), 0);
  const pendingCount = filtered.filter((r) => r.status === "pending").length;

  const handleResolve = async (mode: string) => {
    if (!diffModal) return;
    setResolveLoading(true);
    try {
      await api.post(`/admin/finance/reconciliation/differences/${diffModal.id}/resolve`, { resolve_mode: mode });
      setDiffModal(null);
      fetchData();
    } catch (e: any) {
      alert(e.message ?? "处理失败");
    } finally {
      setResolveLoading(false);
    }
  };

  const handleRunReconciliation = async () => {
    try {
      await api.post("/admin/finance/reconciliation/run", { period: periodFilter === "全部" ? undefined : periodFilter });
      alert("对账已执行");
      fetchData();
    } catch (e: any) {
      alert(e.message ?? "对账执行失败");
    }
  };

  return (
    <AdminLayout>
      <h1 className="page-title">
        对账管理
        <HelpModal title="对账管理">
          <p>管理我方消费记录与供应商账单的核对流程。</p>
          <p style={{ marginTop: 8 }}>
            核对周期内我方的 API 消费金额与供应商提供的账单金额是否一致。
            差异超过阈值将触发差异处理流程。
          </p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">核对供应商账单，处理差异记录</p>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { l: "对账总数", v: String(totalCount) },
          { l: "待处理", v: String(pendingStats.count) },
          { l: "待处理金额", v: `¥${pendingStats.amount.toFixed(2)}` },
          { l: "当前页差额", v: `¥${totalDiff.toFixed(2)}` },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor: "default" }}>
            <div className="stat-card-label">{s.l}</div>
            <div className="stat-card-value">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="panel">
        <div className="panel-header">
          <span>对账记录</span>
          <div className="flex-wrap">
            <select className="form-select" style={{ width: 130 }} value={periodFilter} onChange={(e) => { setPeriodFilter(e.target.value); setPage(1); }}>
              {PERIODS.map((p) => <option key={p} value={p}>{p === "全部" ? "全部周期" : p}</option>)}
            </select>
            <select className="form-select" style={{ width: 120 }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="all">全部状态</option>
              <option value="pending">待处理</option>
              <option value="resolved_platform">平台为准</option>
              <option value="resolved_counterparty">对方为准</option>
              <option value="verify">已核验</option>
            </select>
            <button className="btn btn-sm btn-secondary" onClick={handleRunReconciliation} data-hint="执行对账">🔄 执行对账</button>
            <button className="btn btn-sm btn-secondary" onClick={() => { setPeriodFilter("全部"); setStatusFilter("all"); setPage(1); }}>
              重置
            </button>
          </div>
        </div>

        {loading && <div className="panel-body"><div className="loading-spinner" /> 加载中...</div>}
        {error && <div className="panel-body"><div className="alert alert-danger">{error} <button className="btn btn-xs btn-secondary" onClick={fetchData}>重试</button></div></div>}

        {!loading && !error && (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>编号</th>
                    <th>周期</th>
                    <th>供应商/主体</th>
                    <th>平台金额</th>
                    <th>对方金额</th>
                    <th>差额</th>
                    <th>差异率</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>暂无数据</td></tr>
                  ) : (
                    filtered.map((r) => {
                      const diffRate = r.platform_amount > 0 ? (Math.abs(r.diff_amount) / r.platform_amount) * 100 : 0;
                      return (
                        <tr key={r.id} style={diffRate > 5 ? { background: "var(--color-warning-bg)" } : undefined}>
                          <td className="text-mono" style={{ fontSize: 11 }}>#{r.id}</td>
                          <td>{r.period}</td>
                          <td>{r.subject_name || `ID:${r.subject_id}`}</td>
                          <td className="text-mono">¥{r.platform_amount.toFixed(2)}</td>
                          <td className="text-mono">¥{r.counterparty_amount.toFixed(2)}</td>
                          <td className={`text-mono ${r.diff_amount > 0 ? "badge-danger" : r.diff_amount < 0 ? "badge-warning" : ""}`} style={{ background: r.diff_amount > 0 ? "var(--color-danger-bg)" : r.diff_amount < 0 ? "var(--color-warning-bg)" : "transparent", padding: r.diff_amount !== 0 ? "2px 8px" : 0, borderRadius: 999 }}>
                            {r.diff_amount > 0 ? "+" : ""}¥{r.diff_amount.toFixed(2)}
                          </td>
                          <td>
                            <StatusBadge status={diffRate > 5 ? "error" : diffRate > 1 ? "warning" : "success"}>
                              {diffRate.toFixed(1)}%
                            </StatusBadge>
                          </td>
                          <td>
                            <StatusBadge status={r.status === "verify" ? "success" : r.status === "resolved_platform" ? "info" : r.status === "resolved_counterparty" ? "warning" : "pending"}>
                              {r.status_label}
                            </StatusBadge>
                          </td>
                          <td>
                            {r.status === "pending" && (
                              <>
                                <button className="btn btn-xs btn-primary" style={{ marginRight: 4 }} onClick={() => setDiffModal(r)} data-hint="处理差异">处理</button>
                              </>
                            )}
                            <button className="btn btn-xs btn-secondary" onClick={() => setDiffModal(r)} data-hint="查看详情">详情</button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="panel-body">
              <div className="flex-between">
                <span className="text-sm text-muted">共 {totalCount} 条，第 {safePage}/{Math.max(totalPages, 1)} 页</span>
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

      {/* Diff Modal */}
      <Modal open={!!diffModal} onClose={() => setDiffModal(null)} title="对账差异详情" width={600}>
        {diffModal && (
          <>
            <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="stat-card" style={{ cursor: "default" }}>
                <div className="stat-card-label">平台消费金额</div>
                <div className="stat-card-value" style={{ fontSize: 18 }}>¥{diffModal.platform_amount.toFixed(2)}</div>
              </div>
              <div className="stat-card" style={{ cursor: "default" }}>
                <div className="stat-card-label">供应商账单金额</div>
                <div className="stat-card-value" style={{ fontSize: 18 }}>¥{diffModal.counterparty_amount.toFixed(2)}</div>
              </div>
            </div>
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel-header">差异分析</div>
              <div className="panel-body">
                <table className="data-table">
                  <tbody>
                    <tr><td>差额</td><td className="text-mono" style={{ color: diffModal.diff_amount > 0 ? "var(--color-danger-text)" : "var(--color-warning-text)" }}>{diffModal.diff_amount > 0 ? "+" : ""}¥{diffModal.diff_amount.toFixed(2)}</td></tr>
                    <tr><td>差异率</td><td>{diffModal.platform_amount > 0 ? ((Math.abs(diffModal.diff_amount) / diffModal.platform_amount) * 100).toFixed(2) : "0.00"}%</td></tr>
                    <tr><td>周期</td><td>{diffModal.period}</td></tr>
                    <tr><td>供应商/主体</td><td>{diffModal.subject_name || `ID:${diffModal.subject_id}`}</td></tr>
                    <tr><td>状态</td><td><StatusBadge status={diffModal.status === "pending" ? "warning" : "success"}>{diffModal.status_label}</StatusBadge></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            {diffModal.status === "pending" && (
              <>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">处理模式</label>
                  <div className="flex-wrap" style={{ gap: 8 }}>
                    <button className="btn btn-sm btn-primary" disabled={resolveLoading} onClick={() => handleResolve("platform")} data-hint="以平台数据为准">以平台为准</button>
                    <button className="btn btn-sm btn-secondary" disabled={resolveLoading} onClick={() => handleResolve("counterparty")} data-hint="以供应商数据为准">以对方为准</button>
                    <button className="btn btn-sm btn-secondary" disabled={resolveLoading} onClick={() => handleResolve("verify")} data-hint="标记为已核验">核验通过</button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </Modal>
    </AdminLayout>
  );
}

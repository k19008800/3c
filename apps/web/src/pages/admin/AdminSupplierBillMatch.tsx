import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import StatusBadge from "../../components/StatusBadge";
import { api } from "../../services/api";

// ── Types ──
interface VendorSettlement {
  id: number;
  vendor_id: number;
  vendor_name: string;
  period: string;
  total_calls: number;
  success_calls: number;
  failed_calls: number;
  total_tokens: number;
  total_cost: number;
  user_revenue: number;
  commission_rate: string;
  commission_amount: string;
  settlement_amount: number;
  status: string;
  status_label: string;
  created_at: string;
}

interface ApiListResponse {
  list: VendorSettlement[];
  pagination: { page: number; page_size: number; total: number };
}

const STATUSES = ["全部", "generated", "confirmed", "paid", "disputed"];
const STATUS_LABELS: Record<string, string> = { generated: "已生成", confirmed: "已确认", paid: "已打款", disputed: "争议" };

export default function AdminSupplierBillMatch() {
  const [records, setRecords] = useState<VendorSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const [statusFilter, setStatusFilter] = useState("全部");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (statusFilter !== "全部") params.status = statusFilter;
      const res = await api.get<ApiListResponse>("/admin/vendor-settlements", params);
      setRecords(res.list);
      setTotalCount(res.pagination.total);
    } catch (e: any) {
      setError(e.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const totalMismatch = records.filter((r) => r.status === "disputed").length;
  const totalVendorCost = records.reduce((a, b) => a + b.total_cost, 0);
  const totalSettlement = records.reduce((a, b) => a + b.settlement_amount, 0);

  return (
    <AdminLayout>
      <h1 className="page-title">
        供应商账单匹配
        <HelpModal title="供应商账单匹配">
          <p>管理供应商结算单，查看各周期供应商成本和结算金额。</p>
          <p style={{ marginTop: 8 }}>
            结算流程：生成 → 确认 → 打款。争议状态需要运营介入处理。
          </p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">供应商结算管理与成本对比</p>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { l: "结算单总数", v: String(totalCount) },
          { l: "已确认", v: String(records.filter((r) => r.status === "confirmed" || r.status === "paid").length) },
          { l: "争议", v: String(totalMismatch) },
          { l: "结算总额", v: `¥${totalSettlement.toFixed(2)}` },
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
          <span>结算单列表</span>
          <div className="flex-wrap">
            <select className="form-select" style={{ width: 120 }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s === "全部" ? "全部状态" : STATUS_LABELS[s] ?? s}</option>)}
            </select>
            <button className="btn btn-sm btn-secondary" onClick={() => { setStatusFilter("全部"); setPage(1); }}>重置</button>
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
                    <th>供应商</th>
                    <th>总调用</th>
                    <th>成功/失败</th>
                    <th>Token 量</th>
                    <th>供应成本</th>
                    <th>平台收入</th>
                    <th>结算金额</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>暂无结算单</td></tr>
                  ) : (
                    records.map((r) => (
                      <tr key={r.id} style={r.status === "disputed" ? { background: "var(--color-danger-bg)" } : undefined}>
                        <td className="text-mono" style={{ fontSize: 11 }}>#{r.id}</td>
                        <td>{r.period}</td>
                        <td>{r.vendor_name}</td>
                        <td>{r.total_calls?.toLocaleString()}</td>
                        <td>{r.success_calls}/{r.failed_calls}</td>
                        <td>{Number(r.total_tokens).toLocaleString()}</td>
                        <td className="text-mono">¥{r.total_cost.toFixed(2)}</td>
                        <td className="text-mono">¥{r.user_revenue.toFixed(2)}</td>
                        <td className="text-mono" style={{ fontWeight: 600 }}>¥{r.settlement_amount.toFixed(2)}</td>
                        <td>
                          <StatusBadge status={r.status === "paid" ? "success" : r.status === "confirmed" ? "info" : r.status === "disputed" ? "error" : "pending"}>
                            {r.status_label}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="panel-body">
              <div className="flex-between">
                <span className="text-sm text-muted">共 {totalCount} 条</span>
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
    </AdminLayout>
  );
}
